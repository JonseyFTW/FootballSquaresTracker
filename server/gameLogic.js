// Pure game logic for football squares — no storage or HTTP dependencies.

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function shuffle(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// A strip-10 board must tile all 100 (x,y) last-digit combinations across
// 10 squares so that every possible score has exactly one winner. Splitting
// the x-digit permutation into 2 groups of 5 and the y-permutation into 5
// pairs makes the ten (xGroup x yGroup) blocks a partition of the space.
// Blocks land on spots 1-10 in reading order — the layout groups use on
// paper (spot 1 = first x-group x first y-pair, spot 2 = second x-group x
// first y-pair, ...) — so two drawn digit rows fully determine every spot.
function strip10BlocksFromPermutations(xPerm, yPerm) {
  const xGroups = [xPerm.slice(0, 5), xPerm.slice(5)];
  const yGroups = [];
  for (let i = 0; i < 10; i += 2) {
    yGroups.push(yPerm.slice(i, i + 2));
  }

  const blocks = [];
  for (const yGroup of yGroups) {
    for (const xGroup of xGroups) {
      blocks.push({
        xDigits: [...xGroup].sort((a, b) => a - b),
        yDigits: [...yGroup].sort((a, b) => a - b)
      });
    }
  }
  return blocks;
}

// Creation-time auto-assignment: random permutations AND shuffled spot
// order (dealing digits from repeated pools — the old approach — allowed
// duplicate digits inside a square and scores with zero or two winners).
function generateStrip10Assignments() {
  return shuffle(strip10BlocksFromPermutations(shuffle(DIGITS), shuffle(DIGITS)));
}

// Boards can exist before their numbers are drawn — people claim squares
// first, the digits come later. Grids: no axes yet. Strips: squares
// without digit groups.
function boardHasAxes(board) {
  if (board.type === 'strip-10') {
    return (board.squares || []).length > 0 && board.squares.every(sq =>
      (sq.xDigits || []).length > 0 && (sq.yDigits || []).length > 0);
  }
  return Array.isArray(board.xAxis) && board.xAxis.length === 10 &&
    Array.isArray(board.yAxis) && board.yAxis.length === 10;
}

// Resolve which last digits a square covers, for any board type.
// Returns null for squares that lack the data needed to decide.
function getSquareDigits(board, square) {
  if (board.type === 'strip-10') {
    return { xDigits: square.xDigits || [], yDigits: square.yDigits || [] };
  }
  const { row, col } = square;
  if (row == null || col == null) return null;
  if (board.type === '5x5') {
    return {
      xDigits: [board.xAxis[col * 2], board.xAxis[col * 2 + 1]],
      yDigits: [board.yAxis[row * 2], board.yAxis[row * 2 + 1]]
    };
  }
  return { xDigits: [board.xAxis[col]], yDigits: [board.yAxis[row]] };
}

// All squares that win at the board's current score. Empty pre-game.
// Legacy strip-10 boards can cover a combo more than once, so this
// deliberately returns every match rather than the first.
function findWinningSquares(board) {
  if (!board.currentScore) return [];
  if (board.gamePhase === 'pre-game') return [];
  if (!boardHasAxes(board)) return [];

  const xLastDigit = board.currentScore.xTeam % 10;
  const yLastDigit = board.currentScore.yTeam % 10;

  const winners = [];
  for (const square of board.squares) {
    const digits = getSquareDigits(board, square);
    if (!digits) continue;
    if (digits.xDigits.includes(xLastDigit) && digits.yDigits.includes(yLastDigit)) {
      winners.push({ squareNumber: square.number, owner: square.owner || '' });
    }
  }
  return winners;
}

// The subset of the user's squares that win at the current score.
function checkCurrentWinners(board, userSquares) {
  const userSet = new Set(userSquares);
  return findWinningSquares(board).filter(w => userSet.has(w.squareNumber));
}

// Every (x,y) digit combo the user's squares cover, with example scores.
function calculateWinningScores(board, userSquares) {
  const winningCombinations = [];
  if (!boardHasAxes(board)) return winningCombinations;

  for (const squareNum of userSquares) {
    const square = board.squares.find(s => s.number === squareNum);
    if (!square) continue;

    const digits = getSquareDigits(board, square);
    if (!digits) continue;

    for (const xDigit of digits.xDigits) {
      for (const yDigit of digits.yDigits) {
        const examples = [];
        for (let x = 0; x <= 40; x += 10) {
          for (let y = 0; y <= 40; y += 10) {
            examples.push({ x: x + xDigit, y: y + yDigit });
          }
        }
        // Low-total scores first so the examples read like plausible games
        // instead of six variations that share the same x-team score.
        examples.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);

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

const PHASE_ORDER = ['pre-game', '1st Quarter', '2nd Quarter', 'Halftime', '3rd Quarter', '4th Quarter', 'Overtime', 'Final'];

// When a commissioner advances the game phase by hand, the score they
// submit alongside it is the score at the moment of the change — i.e. the
// end of the most recently completed period. This maps a phase transition
// to that period ('q1' | 'half' | 'q3' | 'final'), or null when no period
// boundary was crossed. Skipped boundaries (jumping 1st Quarter straight
// to Final) stay unrecorded because their scores were never entered.
function latestCompletedPeriod(prevPhase, newPhase) {
  const prev = PHASE_ORDER.indexOf(prevPhase);
  const next = PHASE_ORDER.indexOf(newPhase);
  if (prev === -1 || next === -1 || next <= prev) return null;

  const boundaries = [
    ['q1', PHASE_ORDER.indexOf('2nd Quarter')],
    ['half', PHASE_ORDER.indexOf('Halftime')],
    ['q3', PHASE_ORDER.indexOf('4th Quarter')],
    ['final', PHASE_ORDER.indexOf('Final')]
  ];

  let latest = null;
  for (const [period, at] of boundaries) {
    if (prev < at && next >= at) latest = period;
  }
  return latest;
}

// True when the axis is a permutation of the digits 0-9.
function isValidAxisPermutation(axis) {
  if (!Array.isArray(axis) || axis.length !== 10) return false;
  const seen = new Set(axis.map(Number));
  return seen.size === 10 && DIGITS.every(d => seen.has(d));
}

module.exports = {
  shuffle,
  strip10BlocksFromPermutations,
  generateStrip10Assignments,
  boardHasAxes,
  getSquareDigits,
  findWinningSquares,
  checkCurrentWinners,
  calculateWinningScores,
  latestCompletedPeriod,
  isValidAxisPermutation
};
