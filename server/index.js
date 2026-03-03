require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseImage } = require('./llmService');

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

// Data storage path
const DATA_DIR = path.join(__dirname, 'data');
const BOARDS_FILE = path.join(DATA_DIR, 'boards.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize boards file if it doesn't exist
if (!fs.existsSync(BOARDS_FILE)) {
  fs.writeFileSync(BOARDS_FILE, JSON.stringify({ boards: [] }));
}

// Helper functions
function loadBoards() {
  try {
    const data = fs.readFileSync(BOARDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { boards: [] };
  }
}

function saveBoards(data) {
  fs.writeFileSync(BOARDS_FILE, JSON.stringify(data, null, 2));
}

// Calculate what scores a user needs to win
function calculateWinningScores(board, userSquares) {
  const winningCombinations = [];

  for (const squareNum of userSquares) {
    const square = board.squares.find(s => s.number === squareNum);
    if (!square) continue;

    let xDigits, yDigits;

    if (board.type === 'strip-10') {
      // Strip-10: digits are stored directly on the square
      xDigits = square.xDigits || [];
      yDigits = square.yDigits || [];
    } else if (board.type === '5x5') {
      // In 5x5, each cell covers 2 digits
      const { row, col } = square;
      xDigits = [board.xAxis[col * 2], board.xAxis[col * 2 + 1]];
      yDigits = [board.yAxis[row * 2], board.yAxis[row * 2 + 1]];
    } else {
      // In 10x10, each cell covers 1 digit
      const { row, col } = square;
      xDigits = [board.xAxis[col]];
      yDigits = [board.yAxis[row]];
    }

    // Generate all winning score combinations for this square
    for (const xDigit of xDigits) {
      for (const yDigit of yDigits) {
        // Generate example scores that would result in these last digits
        const examples = [];
        for (let x = 0; x <= 50; x += 10) {
          for (let y = 0; y <= 50; y += 10) {
            const xScore = x + xDigit;
            const yScore = y + yDigit;
            if (xScore <= 56 && yScore <= 56) { // Reasonable football scores
              examples.push({ x: xScore, y: yScore });
            }
          }
        }

        winningCombinations.push({
          squareNumber: squareNum,
          owner: square.owner,
          xTeamDigit: xDigit,
          yTeamDigit: yDigit,
          exampleScores: examples.slice(0, 6) // Limit examples
        });
      }
    }
  }

  return winningCombinations;
}

// Check if current score matches any of user's squares
function checkCurrentWinner(board, userSquares) {
  if (!board.currentScore) return null;
  if (board.gamePhase === 'pre-game') return null;

  const xLastDigit = board.currentScore.xTeam % 10;
  const yLastDigit = board.currentScore.yTeam % 10;

  for (const squareNum of userSquares) {
    const square = board.squares.find(s => s.number === squareNum);
    if (!square) continue;

    let xDigits, yDigits;

    if (board.type === 'strip-10') {
      // Strip-10: digits are stored directly on the square
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

    if (xDigits.includes(xLastDigit) && yDigits.includes(yLastDigit)) {
      return {
        squareNumber: squareNum,
        owner: square.owner,
        isWinning: true
      };
    }
  }

  return null;
}

// API Routes

// Get all boards
app.get('/api/boards', (req, res) => {
  const data = loadBoards();
  res.json(data.boards);
});

// Get single board
app.get('/api/boards/:id', (req, res) => {
  const data = loadBoards();
  const board = data.boards.find(b => b.id === req.params.id);
  if (!board) {
    return res.status(404).json({ error: 'Board not found' });
  }
  res.json(board);
});

// Helper to generate strip-10 number assignments
function generateStrip10Assignments() {
  // Shuffle helper
  const shuffle = (arr) => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  // Create pool: each digit 0-9 appears 5 times for X (primary team)
  const xPool = [];
  for (let digit = 0; digit <= 9; digit++) {
    for (let i = 0; i < 5; i++) {
      xPool.push(digit);
    }
  }
  const shuffledXPool = shuffle(xPool);

  // Create pool: each digit 0-9 appears 2 times for Y (secondary team)
  const yPool = [];
  for (let digit = 0; digit <= 9; digit++) {
    for (let i = 0; i < 2; i++) {
      yPool.push(digit);
    }
  }
  const shuffledYPool = shuffle(yPool);

  // Assign to 10 squares: 5 X-digits and 2 Y-digits each
  const assignments = [];
  for (let i = 0; i < 10; i++) {
    const xDigits = shuffledXPool.slice(i * 5, (i + 1) * 5).sort((a, b) => a - b);
    const yDigits = shuffledYPool.slice(i * 2, (i + 1) * 2).sort((a, b) => a - b);
    assignments.push({ xDigits, yDigits });
  }

  return assignments;
}

// Create new board
app.post('/api/boards', (req, res) => {
  const { name, type, xTeamName, yTeamName, xAxis, yAxis, prizes, squares: importedSquares } = req.body;

  if (!name || !type || !xTeamName || !yTeamName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // For non-strip types, require axis arrays
  if (type !== 'strip-10' && (!xAxis || !yAxis)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let squares = [];

  if (type === 'strip-10') {
    if (Array.isArray(importedSquares) && importedSquares.length === 10 && importedSquares[0]?.xDigits) {
      // Use imported squares with their digit assignments (from LLM or client)
      squares = importedSquares.map((sq, i) => ({
        number: sq.number || i + 1,
        xDigits: (sq.xDigits || []).map(Number),
        yDigits: (sq.yDigits || []).map(Number),
        owner: sq.owner || ''
      }));
    } else {
      // Generate strip-10 board with random number assignments
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
      // Use imported squares (from LLM) for grid types
      const gridSize = type === '5x5' ? 5 : 10;
      const expectedCount = gridSize * gridSize;
      squares = importedSquares.slice(0, expectedCount).map((sq, idx) => ({
        number: sq.number || idx + 1,
        row: sq.row ?? Math.floor(idx / gridSize),
        col: sq.col ?? idx % gridSize,
        owner: sq.owner || ''
      }));
    } else {
      // Standard grid board with empty squares
      const gridSize = type === '5x5' ? 5 : 10;
      let squareNum = 1;

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          squares.push({
            number: squareNum++,
            row,
            col,
            owner: ''
          });
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

  const data = loadBoards();
  data.boards.push(newBoard);
  saveBoards(data);

  res.status(201).json(newBoard);
});

// Update board squares (assign owners)
app.put('/api/boards/:id/squares', (req, res) => {
  const { squares } = req.body;
  const data = loadBoards();
  const boardIndex = data.boards.findIndex(b => b.id === req.params.id);

  if (boardIndex === -1) {
    return res.status(404).json({ error: 'Board not found' });
  }

  data.boards[boardIndex].squares = squares;
  saveBoards(data);

  res.json(data.boards[boardIndex]);
});

// Update single square owner
app.put('/api/boards/:id/squares/:squareNum', (req, res) => {
  const { owner } = req.body;
  const squareNum = parseInt(req.params.squareNum);
  const data = loadBoards();
  const boardIndex = data.boards.findIndex(b => b.id === req.params.id);

  if (boardIndex === -1) {
    return res.status(404).json({ error: 'Board not found' });
  }

  const squareIndex = data.boards[boardIndex].squares.findIndex(s => s.number === squareNum);
  if (squareIndex === -1) {
    return res.status(404).json({ error: 'Square not found' });
  }

  data.boards[boardIndex].squares[squareIndex].owner = owner;
  saveBoards(data);

  res.json(data.boards[boardIndex]);
});

// Update game score
app.put('/api/boards/:id/score', (req, res) => {
  const { xTeam, yTeam, gamePhase } = req.body;
  const data = loadBoards();
  const boardIndex = data.boards.findIndex(b => b.id === req.params.id);

  if (boardIndex === -1) {
    return res.status(404).json({ error: 'Board not found' });
  }

  data.boards[boardIndex].currentScore = {
    xTeam: parseInt(xTeam) || 0,
    yTeam: parseInt(yTeam) || 0
  };

  if (gamePhase) {
    data.boards[boardIndex].gamePhase = gamePhase;
  }

  saveBoards(data);
  res.json(data.boards[boardIndex]);
});

// Get winning combinations for user's squares
app.get('/api/boards/:id/my-squares', (req, res) => {
  const { squares } = req.query;

  if (!squares) {
    return res.status(400).json({ error: 'Please provide square numbers' });
  }

  const userSquares = squares.split(',').map(s => parseInt(s.trim()));
  const data = loadBoards();
  const board = data.boards.find(b => b.id === req.params.id);

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
});

// Delete board
app.delete('/api/boards/:id', (req, res) => {
  const data = loadBoards();
  const boardIndex = data.boards.findIndex(b => b.id === req.params.id);

  if (boardIndex === -1) {
    return res.status(404).json({ error: 'Board not found' });
  }

  data.boards.splice(boardIndex, 1);
  saveBoards(data);

  res.json({ success: true });
});

// Get configured LLM providers (which have API keys in .env)
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

    // Use server-side API key if available, otherwise use client-provided key
    const apiKey = API_KEYS[provider] || clientApiKey;

    if (!apiKey) {
      return res.status(400).json({
        error: `No API key configured for ${provider}. Add ${provider.toUpperCase()}_API_KEY to your .env file or enter a key manually.`
      });
    }

    // Extract base64 data (remove data:image/...;base64, prefix if present)
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

app.listen(PORT, () => {
  console.log(`Football Squares Tracker server running on port ${PORT}`);
});
