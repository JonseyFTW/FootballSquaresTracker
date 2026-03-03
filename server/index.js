require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseImage } = require('./llmService');

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
// Game logic (pure functions, no storage dependency)
// ============================================================

function calculateWinningScores(board, userSquares) {
  const winningCombinations = [];

  for (const squareNum of userSquares) {
    const square = board.squares.find(s => s.number === squareNum);
    if (!square) continue;

    let xDigits, yDigits;

    if (board.type === 'strip-10') {
      xDigits = square.xDigits || [];
      yDigits = square.yDigits || [];
    } else if (board.type === '5x5') {
      const { row, col } = square;
      xDigits = [board.xAxis[col * 2], board.xAxis[col * 2 + 1]];
      yDigits = [board.yAxis[row * 2], board.yAxis[row * 2 + 1]];
    } else {
      const { row, col } = square;
      xDigits = [board.xAxis[col]];
      yDigits = [board.yAxis[row]];
    }

    for (const xDigit of xDigits) {
      for (const yDigit of yDigits) {
        const examples = [];
        for (let x = 0; x <= 50; x += 10) {
          for (let y = 0; y <= 50; y += 10) {
            const xScore = x + xDigit;
            const yScore = y + yDigit;
            if (xScore <= 56 && yScore <= 56) {
              examples.push({ x: xScore, y: yScore });
            }
          }
        }

        winningCombinations.push({
          squareNumber: squareNum,
          owner: square.owner,
          xTeamDigit: xDigit,
          yTeamDigit: yDigit,
          exampleScores: examples.slice(0, 6)
        });
      }
    }
  }

  return winningCombinations;
}

function checkCurrentWinner(board, userSquares) {
  if (!board.currentScore) return null;
  if (board.gamePhase === 'pre-game') return null;

  const xLastDigit = board.currentScore.xTeam % 10;
  const yLastDigit = board.currentScore.yTeam % 10;

  const winners = [];

  for (const squareNum of userSquares) {
    const square = board.squares.find(s => s.number === squareNum);
    if (!square) continue;

    let xDigits, yDigits;

    if (board.type === 'strip-10') {
      xDigits = square.xDigits || [];
      yDigits = square.yDigits || [];
    } else if (board.type === '5x5') {
      const { row, col } = square;
      if (row == null || col == null) continue;
      xDigits = [board.xAxis[col * 2], board.xAxis[col * 2 + 1]];
      yDigits = [board.yAxis[row * 2], board.yAxis[row * 2 + 1]];
    } else {
      const { row, col } = square;
      if (row == null || col == null) continue;
      xDigits = [board.xAxis[col]];
      yDigits = [board.yAxis[row]];
    }

    if (xDigits.includes(xLastDigit) && yDigits.includes(yLastDigit)) {
      winners.push({
        squareNumber: squareNum,
        owner: square.owner,
        isWinning: true
      });
    }
  }

  return winners.length > 0 ? winners[0] : null;
}

function generateStrip10Assignments() {
  const shuffle = (arr) => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  const xPool = [];
  for (let digit = 0; digit <= 9; digit++) {
    for (let i = 0; i < 5; i++) xPool.push(digit);
  }
  const shuffledXPool = shuffle(xPool);

  const yPool = [];
  for (let digit = 0; digit <= 9; digit++) {
    for (let i = 0; i < 2; i++) yPool.push(digit);
  }
  const shuffledYPool = shuffle(yPool);

  const assignments = [];
  for (let i = 0; i < 10; i++) {
    const xDigits = shuffledXPool.slice(i * 5, (i + 1) * 5).sort((a, b) => a - b);
    const yDigits = shuffledYPool.slice(i * 2, (i + 1) * 2).sort((a, b) => a - b);
    assignments.push({ xDigits, yDigits });
  }

  return assignments;
}

// ============================================================
// API Routes (all async)
// ============================================================

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

    if (type !== 'strip-10' && (!xAxis || !yAxis)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let squares = [];

    if (type === 'strip-10') {
      if (Array.isArray(importedSquares) && importedSquares.length === 10 && importedSquares[0]?.xDigits) {
        squares = importedSquares.map((sq, i) => ({
          number: sq.number || i + 1,
          xDigits: (sq.xDigits || []).map(Number),
          yDigits: (sq.yDigits || []).map(Number),
          owner: sq.owner || ''
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
      if (Array.isArray(importedSquares) && importedSquares.length > 0) {
        const gridSize = type === '5x5' ? 5 : 10;
        const expectedCount = gridSize * gridSize;
        squares = importedSquares.slice(0, expectedCount).map((sq, idx) => ({
          number: sq.number || idx + 1,
          row: sq.row ?? Math.floor(idx / gridSize),
          col: sq.col ?? idx % gridSize,
          owner: sq.owner || ''
        }));
      } else {
        const gridSize = type === '5x5' ? 5 : 10;
        let squareNum = 1;
        for (let row = 0; row < gridSize; row++) {
          for (let col = 0; col < gridSize; col++) {
            squares.push({ number: squareNum++, row, col, owner: '' });
          }
        }
      }
    }

    const newBoard = {
      id: uuidv4(),
      name,
      type,
      xTeamName,
      yTeamName,
      xAxis: type === 'strip-10' ? [] : xAxis.map(Number),
      yAxis: type === 'strip-10' ? [] : yAxis.map(Number),
      prizes: prizes || {},
      squares,
      currentScore: { xTeam: 0, yTeam: 0 },
      gamePhase: 'pre-game',
      createdAt: new Date().toISOString()
    };

    await createBoard(newBoard);
    res.status(201).json(newBoard);
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Update board squares (assign owners)
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

    board.squares = squares;
    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error updating squares:', error);
    res.status(500).json({ error: 'Failed to update squares' });
  }
});

// Update single square owner
app.put('/api/boards/:id/squares/:squareNum', async (req, res) => {
  try {
    const { owner } = req.body;
    const squareNum = parseInt(req.params.squareNum, 10);

    const board = await getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const squareIndex = board.squares.findIndex(s => s.number === squareNum);
    if (squareIndex === -1) {
      return res.status(404).json({ error: 'Square not found' });
    }

    board.squares[squareIndex].owner = owner;
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

    if (gamePhase) {
      board.gamePhase = gamePhase;
    }

    await updateBoard(board);
    res.json(board);
  } catch (error) {
    console.error('Error updating score:', error);
    res.status(500).json({ error: 'Failed to update score' });
  }
});

// Get winning combinations for user's squares
app.get('/api/boards/:id/my-squares', async (req, res) => {
  try {
    const { squares } = req.query;

    if (!squares) {
      return res.status(400).json({ error: 'Please provide square numbers' });
    }

    const userSquares = squares.split(',').map(s => parseInt(s.trim(), 10));
    const board = await getBoardById(req.params.id);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const winningCombinations = calculateWinningScores(board, userSquares);
    const currentWinner = checkCurrentWinner(board, userSquares);

    res.json({
      board,
      userSquares,
      winningCombinations,
      currentWinner,
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

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    if (!provider) {
      return res.status(400).json({ error: 'No provider specified (gemini, claude, or openai)' });
    }

    const apiKey = API_KEYS[provider] || clientApiKey;

    if (!apiKey) {
      return res.status(400).json({
        error: `No API key configured for ${provider}. Add ${provider.toUpperCase()}_API_KEY to your .env file or enter a key manually.`
      });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const result = await parseImage(base64Data, provider, apiKey);
    res.json(result);
  } catch (error) {
    console.error('Image parsing error:', error);
    res.status(500).json({ error: error.message });
  }
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
