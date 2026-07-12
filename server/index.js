require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseImage } = require('./llmService');
const { getScoreboard, getGame, applyGameToBoard } = require('./nflService');
const {
  generateStrip10Assignments,
  findWinningSquares,
  checkCurrentWinners,
  calculateWinningScores,
  isValidAxisPermutation
} = require('./gameLogic');

// Determine storage mode: Postgres on Vercel, file-based locally
const usePostgres = !!process.env.POSTGRES_URL;
let db;
if (usePostgres) {
  db = require('./db');
}

// API keys from environment
const API_KEYS = {
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.CLAUDE_API_KEY
};

const BOARD_TYPES = ['5x5', '10x10', 'strip-10'];
const LLM_PROVIDERS = ['gemini', 'openai', 'claude'];
const PERIODS = ['q1', 'half', 'q3', 'final'];
const MAX_OWNER_LENGTH = 60;
const MAX_PHASE_LENGTH = 30;

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================================
// Storage abstraction: file-based (local) vs Postgres (Vercel)
// ============================================================

// File-based storage (local dev only) or in-memory fallback (Vercel without Postgres)
const DATA_DIR = path.join(__dirname, 'data');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');

// In-memory store for Vercel without Postgres (data won't persist across cold starts)
let inMemoryBoards = { boards: [] };
const useInMemory = !usePostgres && !!process.env.VERCEL;

if (!usePostgres && !process.env.VERCEL) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BOARDS_FILE)) {
    fs.writeFileSync(BOARDS_FILE, JSON.stringify({ boards: [] }));
  }
}

function loadBoardsFromFile() {
  if (useInMemory) return inMemoryBoards;
  try {
    const data = fs.readFileSync(BOARDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { boards: [] };
  }
}

function saveBoardsToFile(data) {
  if (useInMemory) {
    inMemoryBoards = data;
    return;
  }
  fs.writeFileSync(BOARDS_FILE, JSON.stringify(data, null, 2));
}

// Unified async storage interface
async function getAllBoards() {
  if (usePostgres) {
    const data = await db.loadBoards();
    return data.boards;
  }
  return loadBoardsFromFile().boards;
}

async function getBoardById(id) {
  if (usePostgres) {
    return await db.getBoard(id);
  }
  const data = loadBoardsFromFile();
  return data.boards.find(b => b.id === id) || null;
}

async function createBoard(board) {
  if (usePostgres) {
    await db.saveBoard(board);
  } else {
    const data = loadBoardsFromFile();
    data.boards.push(board);
    saveBoardsToFile(data);
  }
}

async function updateBoard(board) {
  if (usePostgres) {
    await db.saveBoard(board);
  } else {
    const data = loadBoardsFromFile();
    const idx = data.boards.findIndex(b => b.id === board.id);
    if (idx !== -1) {
      data.boards[idx] = board;
      saveBoardsToFile(data);
    }
  }
}

async function removeBoardById(id) {
  if (usePostgres) {
    await db.deleteBoard(id);
  } else {
    const data = loadBoardsFromFile();
    const idx = data.boards.findIndex(b => b.id === id);
    if (idx !== -1) {
      data.boards.splice(idx, 1);
      saveBoardsToFile(data);
    }
  }
}

// ============================================================
// Input sanitizers
// ============================================================

function sanitizeOwner(owner) {
  if (typeof owner !== 'string') return '';
  return owner.trim().slice(0, MAX_OWNER_LENGTH);
}

// Comma of ints 0-9, deduped and sorted. Returns null when nothing valid.
function sanitizeDigits(digits) {
  if (!Array.isArray(digits)) return null;
  const clean = [...new Set(
    digits.map(d => parseInt(d, 10)).filter(d => !isNaN(d) && d >= 0 && d <= 9)
  )].sort((a, b) => a - b);
  return clean.length > 0 ? clean : null;
}

// ============================================================
// API Routes (all async)
// ============================================================

// Health check — reports which storage backend is live so deployments
// can be verified (memory on Vercel means boards vanish on cold starts).
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storage: usePostgres ? 'postgres' : (useInMemory ? 'memory' : 'file'),
    persistent: usePostgres || !process.env.VERCEL
  });
});

// List NFL games from ESPN (optional ?dates=YYYYMMDD, defaults to the
// current week's scoreboard)
app.get('/api/nfl/scoreboard', async (req, res) => {
  try {
    const { dates } = req.query;
    if (dates && !/^\d{8}$/.test(dates)) {
      return res.status(400).json({ error: 'dates must be in YYYYMMDD format' });
    }
    res.json(await getScoreboard(dates));
  } catch (error) {
    console.error('Error fetching NFL scoreboard:', error);
    res.status(502).json({ error: 'Failed to fetch NFL scoreboard' });
  }
});

// Get all boards
app.get('/api/boards', async (req, res) => {
  try {
    const boards = await getAllBoards();
    res.json(boards);
  } catch (error) {
    console.error('Error loading boards:', error);
    res.status(500).json({ error: 'Failed to load boards' });
  }
});

// Get single board
app.get('/api/boards/:id', async (req, res) => {
  try {
    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    res.json(board);
  } catch (error) {
    console.error('Error loading board:', error);
    res.status(500).json({ error: 'Failed to load board' });
  }
});

// Create new board
app.post('/api/boards', async (req, res) => {
  try {
    const { name, type, xTeamName, yTeamName, xAxis, yAxis, prizes, squares: importedSquares } = req.body;

    if (!name || !type || !xTeamName || !yTeamName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!BOARD_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid board type. Use one of: ${BOARD_TYPES.join(', ')}` });
    }

    if (type !== 'strip-10') {
      if (!isValidAxisPermutation(xAxis) || !isValidAxisPermutation(yAxis)) {
        return res.status(400).json({ error: 'Each axis must contain the digits 0-9 exactly once' });
      }
    }

    let squares = [];

    if (type === 'strip-10') {
      if (Array.isArray(importedSquares) && importedSquares.length === 10 && importedSquares[0]?.xDigits) {
        squares = importedSquares.map((sq, i) => ({
          number: sq.number || i + 1,
          xDigits: sanitizeDigits(sq.xDigits) || [],
          yDigits: sanitizeDigits(sq.yDigits) || [],
          owner: sanitizeOwner(sq.owner)
        }));
      } else {
        const stripAssignments = generateStrip10Assignments();
        for (let i = 0; i < 10; i++) {
          squares.push({
            number: i + 1,
            xDigits: stripAssignments[i].xDigits,
            yDigits: stripAssignments[i].yDigits,
            owner: ''
          });
        }
      }
    } else {
      // Always build the full grid row-major so the board can never have
      // holes, then overlay any imported owners by position.
      const gridSize = type === '5x5' ? 5 : 10;
      const ownerByPos = {};
      if (Array.isArray(importedSquares)) {
        for (const sq of importedSquares) {
          if (sq && sq.row != null && sq.col != null) {
            ownerByPos[`${sq.row}-${sq.col}`] = sanitizeOwner(sq.owner);
          }
        }
      }
      let squareNum = 1;
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          squares.push({
            number: squareNum++,
            row,
            col,
            owner: ownerByPos[`${row}-${col}`] || ''
          });
        }
      }
    }

    const newBoard = {
      id: uuidv4(),
      name: String(name).trim().slice(0, 100),
      type,
      xTeamName: String(xTeamName).trim().slice(0, 40),
      yTeamName: String(yTeamName).trim().slice(0, 40),
      xAxis: type === 'strip-10' ? [] : xAxis.map(Number),
      yAxis: type === 'strip-10' ? [] : yAxis.map(Number),
      prizes: prizes || {},
      squares,
      currentScore: { xTeam: 0, yTeam: 0 },
      gamePhase: 'pre-game',
      periodResults: {},
      createdAt: new Date().toISOString()
    };

    await createBoard(newBoard);
    res.status(201).json(newBoard);
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Update board squares in bulk (owners and, for strip boards, digits).
// Geometry (row/col/number) always comes from the stored board so a bad
// payload can't corrupt the grid.
app.put('/api/boards/:id/squares', async (req, res) => {
  try {
    const { squares } = req.body;

    if (!Array.isArray(squares) || squares.length === 0) {
      return res.status(400).json({ error: 'squares must be a non-empty array' });
    }

    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const incomingByNumber = new Map();
    for (const sq of squares) {
      if (sq && sq.number != null) {
        incomingByNumber.set(parseInt(sq.number, 10), sq);
      }
    }

    board.squares = board.squares.map(existing => {
      const incoming = incomingByNumber.get(existing.number);
      if (!incoming) return existing;
      const updated = { ...existing, owner: sanitizeOwner(incoming.owner) };
      if (board.type === 'strip-10') {
        const xDigits = sanitizeDigits(incoming.xDigits);
        const yDigits = sanitizeDigits(incoming.yDigits);
        if (xDigits) updated.xDigits = xDigits;
        if (yDigits) updated.yDigits = yDigits;
      }
      return updated;
    });

    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error updating squares:', error);
    res.status(500).json({ error: 'Failed to update squares' });
  }
});

// Update single square: owner and, for strip boards, digit coverage
app.put('/api/boards/:id/squares/:squareNum', async (req, res) => {
  try {
    const { owner, xDigits, yDigits } = req.body;
    const squareNum = parseInt(req.params.squareNum, 10);

    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const squareIndex = board.squares.findIndex(s => s.number === squareNum);
    if (squareIndex === -1) {
      return res.status(404).json({ error: 'Square not found' });
    }

    const square = board.squares[squareIndex];
    if (owner !== undefined) {
      square.owner = sanitizeOwner(owner);
    }

    if (board.type === 'strip-10') {
      if (xDigits !== undefined) {
        const clean = sanitizeDigits(xDigits);
        if (!clean) {
          return res.status(400).json({ error: 'xDigits must contain at least one digit 0-9' });
        }
        square.xDigits = clean;
      }
      if (yDigits !== undefined) {
        const clean = sanitizeDigits(yDigits);
        if (!clean) {
          return res.status(400).json({ error: 'yDigits must contain at least one digit 0-9' });
        }
        square.yDigits = clean;
      }
    }

    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error updating square owner:', error);
    res.status(500).json({ error: 'Failed to update square owner' });
  }
});

// Update game score
app.put('/api/boards/:id/score', async (req, res) => {
  try {
    const { xTeam, yTeam, gamePhase } = req.body;

    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!board.currentScore) {
      board.currentScore = { xTeam: 0, yTeam: 0 };
    }

    if (xTeam !== undefined) {
      const parsed = parseInt(xTeam, 10);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'Invalid score value for xTeam' });
      }
      board.currentScore.xTeam = parsed;
    }
    if (yTeam !== undefined) {
      const parsed = parseInt(yTeam, 10);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'Invalid score value for yTeam' });
      }
      board.currentScore.yTeam = parsed;
    }

    if (gamePhase !== undefined) {
      if (typeof gamePhase !== 'string' || gamePhase.length === 0 || gamePhase.length > MAX_PHASE_LENGTH) {
        return res.status(400).json({ error: 'Invalid game phase' });
      }
      board.gamePhase = gamePhase;
    }

    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error updating score:', error);
    res.status(500).json({ error: 'Failed to update score' });
  }
});

// Link (or unlink) a board to a live NFL game. xTeamSide says whether
// the board's x-team is ESPN's home or away side.
app.put('/api/boards/:id/live-game', async (req, res) => {
  try {
    const { eventId, xTeamSide, clear } = req.body;

    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (clear) {
      delete board.liveGame;
      await updateBoard(board);
      return res.json(board);
    }

    if (!eventId || !['home', 'away'].includes(xTeamSide)) {
      return res.status(400).json({ error: 'eventId and xTeamSide (home|away) are required' });
    }

    // Validate the event against ESPN and pull the current score right away
    const game = await getGame(String(eventId));
    board.liveGame = {
      eventId: String(eventId),
      xTeamSide,
      gameName: game.name,
      linkedAt: new Date().toISOString()
    };
    applyGameToBoard(board, game);

    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error linking live game:', error);
    res.status(502).json({ error: 'Failed to link live game (ESPN lookup failed)' });
  }
});

// Pull the latest live score from ESPN into the board
app.post('/api/boards/:id/sync-live', async (req, res) => {
  try {
    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    if (!board.liveGame?.eventId) {
      return res.status(400).json({ error: 'Board is not linked to a live game' });
    }

    const game = await getGame(board.liveGame.eventId);
    applyGameToBoard(board, game);

    await updateBoard(board);
    res.json({ board, game });
  } catch (error) {
    console.error('Error syncing live score:', error);
    res.status(502).json({ error: 'Failed to sync live score' });
  }
});

// Record (or clear) the winning square for a game period, so prize
// payouts stay visible after the score moves on.
app.put('/api/boards/:id/period-result', async (req, res) => {
  try {
    const { period, clear } = req.body;

    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: `period must be one of: ${PERIODS.join(', ')}` });
    }

    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    board.periodResults = board.periodResults || {};

    if (clear) {
      delete board.periodResults[period];
      await updateBoard(board);
      return res.json(board);
    }

    if (!board.currentScore || board.gamePhase === 'pre-game') {
      return res.status(400).json({ error: 'Set the score and game phase before recording a result' });
    }

    board.periodResults[period] = {
      winners: findWinningSquares(board),
      score: { xTeam: board.currentScore.xTeam, yTeam: board.currentScore.yTeam },
      recordedAt: new Date().toISOString()
    };

    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error recording period result:', error);
    res.status(500).json({ error: 'Failed to record period result' });
  }
});

// Get winning combinations for user's squares
app.get('/api/boards/:id/my-squares', async (req, res) => {
  try {
    const { squares } = req.query;

    if (!squares) {
      return res.status(400).json({ error: 'Please provide square numbers' });
    }

    const userSquares = [...new Set(
      squares.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    )];

    if (userSquares.length === 0) {
      return res.status(400).json({ error: 'No valid square numbers provided' });
    }

    const board = await getBoardById(req.params.id);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const winningCombinations = calculateWinningScores(board, userSquares);
    const currentWinners = checkCurrentWinners(board, userSquares);

    res.json({
      board,
      userSquares,
      winningCombinations,
      currentWinners,
      // Deprecated: kept for older clients that expect a single winner
      currentWinner: currentWinners[0] || null,
      currentScore: board.currentScore
    });
  } catch (error) {
    console.error('Error getting winning combinations:', error);
    res.status(500).json({ error: 'Failed to get winning combinations' });
  }
});

// Delete board
app.delete('/api/boards/:id', async (req, res) => {
  try {
    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    await removeBoardById(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// Get configured LLM providers
app.get('/api/llm-providers', (req, res) => {
  const providers = [];

  if (API_KEYS.gemini) {
    providers.push({ id: 'gemini', name: 'Google Gemini', configured: true });
  }
  if (API_KEYS.openai) {
    providers.push({ id: 'openai', name: 'OpenAI GPT-4o-mini', configured: true });
  }
  if (API_KEYS.claude) {
    providers.push({ id: 'claude', name: 'Anthropic Claude', configured: true });
  }

  res.json({ providers, hasConfiguredProviders: providers.length > 0 });
});

// Parse image using LLM
app.post('/api/parse-image', async (req, res) => {
  try {
    const { image, provider, apiKey: clientApiKey } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image provided' });
    }

    if (!LLM_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'No valid provider specified (gemini, claude, or openai)' });
    }

    const apiKey = API_KEYS[provider] || clientApiKey;

    if (!apiKey) {
      return res.status(400).json({
        error: `No API key configured for ${provider}. Add ${provider.toUpperCase()}_API_KEY to your .env file or enter a key manually.`
      });
    }

    // Preserve the real mime type — Claude rejects images whose bytes
    // don't match the declared media type.
    const mimeMatch = image.match(/^data:(image\/[\w.+-]+);base64,/i);
    const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/png';
    const base64Data = image.replace(/^data:image\/[\w.+-]+;base64,/i, '');

    if (!base64Data) {
      return res.status(400).json({ error: 'Image data is empty' });
    }

    const result = await parseImage(base64Data, mimeType, provider, apiKey);
    res.json(result);
  } catch (error) {
    console.error('Image parsing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unknown API routes get a JSON 404 instead of falling through to the SPA
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Only start listener when not imported as a module (i.e., not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Football Squares Tracker server running on port ${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;
