const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

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

    // Get the digit pairs for this square based on board type
    const { row, col } = square;
    let xDigits, yDigits;

    if (board.type === '5x5') {
      // In 5x5, each cell covers 2 digits
      const colIndex = col;
      const rowIndex = row;
      xDigits = [board.xAxis[colIndex * 2], board.xAxis[colIndex * 2 + 1]];
      yDigits = [board.yAxis[rowIndex * 2], board.yAxis[rowIndex * 2 + 1]];
    } else {
      // In 10x10, each cell covers 1 digit
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

  const xLastDigit = board.currentScore.xTeam % 10;
  const yLastDigit = board.currentScore.yTeam % 10;

  for (const squareNum of userSquares) {
    const square = board.squares.find(s => s.number === squareNum);
    if (!square) continue;

    const { row, col } = square;
    let xDigits, yDigits;

    if (board.type === '5x5') {
      const colIndex = col;
      const rowIndex = row;
      xDigits = [board.xAxis[colIndex * 2], board.xAxis[colIndex * 2 + 1]];
      yDigits = [board.yAxis[rowIndex * 2], board.yAxis[rowIndex * 2 + 1]];
    } else {
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

// Create new board
app.post('/api/boards', (req, res) => {
  const { name, type, xTeamName, yTeamName, xAxis, yAxis, prizes } = req.body;

  if (!name || !type || !xTeamName || !yTeamName || !xAxis || !yAxis) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const gridSize = type === '5x5' ? 5 : 10;
  const squares = [];
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

  const newBoard = {
    id: uuidv4(),
    name,
    type,
    xTeamName,
    yTeamName,
    xAxis: xAxis.map(Number),
    yAxis: yAxis.map(Number),
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
