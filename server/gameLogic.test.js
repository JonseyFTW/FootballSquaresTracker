const test = require('node:test');
const assert = require('node:assert');
const {
  generateStrip10Assignments,
  findWinningSquares,
  checkCurrentWinners,
  calculateWinningScores,
  isValidAxisPermutation
} = require('./gameLogic');

function makeStripBoard(assignments) {
  return {
    type: 'strip-10',
    gamePhase: '1st Quarter',
    currentScore: { xTeam: 0, yTeam: 0 },
    squares: assignments.map((a, i) => ({
      number: i + 1,
      xDigits: a.xDigits,
      yDigits: a.yDigits,
      owner: `Player ${i + 1}`
    }))
  };
}

function makeGridBoard(type) {
  const size = type === '5x5' ? 5 : 10;
  const squares = [];
  let n = 1;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      squares.push({ number: n++, row, col, owner: '' });
    }
  }
  return {
    type,
    gamePhase: '1st Quarter',
    currentScore: { xTeam: 0, yTeam: 0 },
    xAxis: [3, 7, 0, 9, 1, 5, 8, 2, 6, 4],
    yAxis: [6, 1, 9, 4, 0, 8, 3, 5, 7, 2],
    squares
  };
}

test('strip-10 assignments have 5 unique x-digits and 2 unique y-digits per square', () => {
  for (let run = 0; run < 200; run++) {
    const assignments = generateStrip10Assignments();
    assert.strictEqual(assignments.length, 10);
    for (const a of assignments) {
      assert.strictEqual(new Set(a.xDigits).size, 5, `duplicate x-digits: ${a.xDigits}`);
      assert.strictEqual(new Set(a.yDigits).size, 2, `duplicate y-digits: ${a.yDigits}`);
      for (const d of [...a.xDigits, ...a.yDigits]) {
        assert.ok(d >= 0 && d <= 9);
      }
    }
  }
});

test('strip-10 assignments tile all 100 digit combos exactly once', () => {
  for (let run = 0; run < 200; run++) {
    const assignments = generateStrip10Assignments();
    const combos = new Set();
    let total = 0;
    for (const a of assignments) {
      for (const x of a.xDigits) {
        for (const y of a.yDigits) {
          combos.add(`${x}-${y}`);
          total++;
        }
      }
    }
    assert.strictEqual(total, 100, 'total combos covered');
    assert.strictEqual(combos.size, 100, 'combos covered without overlap');
  }
});

test('strip-10: every digit appears in exactly 5 squares (x) and 2 squares (y)', () => {
  const assignments = generateStrip10Assignments();
  const xCounts = Array(10).fill(0);
  const yCounts = Array(10).fill(0);
  for (const a of assignments) {
    a.xDigits.forEach(d => xCounts[d]++);
    a.yDigits.forEach(d => yCounts[d]++);
  }
  assert.deepStrictEqual(xCounts, Array(10).fill(5));
  assert.deepStrictEqual(yCounts, Array(10).fill(2));
});

test('strip-10: every possible score has exactly one winning square', () => {
  for (let run = 0; run < 20; run++) {
    const board = makeStripBoard(generateStrip10Assignments());
    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 9; y++) {
        board.currentScore = { xTeam: 10 + x, yTeam: 20 + y };
        const winners = findWinningSquares(board);
        assert.strictEqual(winners.length, 1, `score ${x}-${y} had ${winners.length} winners`);
      }
    }
  }
});

test('findWinningSquares returns every match on legacy overlapping strip boards', () => {
  const board = makeStripBoard([
    { xDigits: [1, 2, 3, 4, 5], yDigits: [0, 1] },
    { xDigits: [1, 6, 7, 8, 9], yDigits: [0, 2] }, // overlaps (1, 0) with square 1
    { xDigits: [0, 2, 3, 4, 5], yDigits: [3, 4] },
    { xDigits: [0, 6, 7, 8, 9], yDigits: [5, 6] },
    { xDigits: [1, 2, 3, 4, 5], yDigits: [7, 8] },
    { xDigits: [0, 6, 7, 8, 9], yDigits: [9, 1] },
    { xDigits: [1, 2, 3, 4, 5], yDigits: [2, 9] },
    { xDigits: [0, 6, 7, 8, 9], yDigits: [3, 4] },
    { xDigits: [1, 2, 3, 4, 5], yDigits: [5, 6] },
    { xDigits: [0, 6, 7, 8, 9], yDigits: [7, 8] }
  ]);
  board.currentScore = { xTeam: 21, yTeam: 10 };
  const winners = findWinningSquares(board);
  assert.deepStrictEqual(winners.map(w => w.squareNumber), [1, 2]);
});

test('no winner reported pre-game or without a score', () => {
  const board = makeGridBoard('10x10');
  board.gamePhase = 'pre-game';
  assert.deepStrictEqual(findWinningSquares(board), []);
  board.gamePhase = '1st Quarter';
  board.currentScore = null;
  assert.deepStrictEqual(findWinningSquares(board), []);
});

test('10x10 board: exactly one winner for every score', () => {
  const board = makeGridBoard('10x10');
  for (let x = 0; x <= 9; x++) {
    for (let y = 0; y <= 9; y++) {
      board.currentScore = { xTeam: x, yTeam: y };
      const winners = findWinningSquares(board);
      assert.strictEqual(winners.length, 1);
      // xAxis[col] === x and yAxis[row] === y for the winning square
      const sq = board.squares.find(s => s.number === winners[0].squareNumber);
      assert.strictEqual(board.xAxis[sq.col], x);
      assert.strictEqual(board.yAxis[sq.row], y);
    }
  }
});

test('5x5 board: exactly one winner for every score', () => {
  const board = makeGridBoard('5x5');
  for (let x = 0; x <= 9; x++) {
    for (let y = 0; y <= 9; y++) {
      board.currentScore = { xTeam: 30 + x, yTeam: 40 + y };
      const winners = findWinningSquares(board);
      assert.strictEqual(winners.length, 1, `score ${x}-${y}`);
    }
  }
});

test('checkCurrentWinners filters to the tracked squares', () => {
  const board = makeGridBoard('10x10');
  board.currentScore = { xTeam: 3, yTeam: 6 }; // xAxis[0]=3, yAxis[0]=6 → square 1
  assert.strictEqual(findWinningSquares(board)[0].squareNumber, 1);
  assert.strictEqual(checkCurrentWinners(board, [1, 50]).length, 1);
  assert.strictEqual(checkCurrentWinners(board, [2, 50]).length, 0);
});

test('calculateWinningScores covers each digit pair with varied example scores', () => {
  const board = makeGridBoard('5x5');
  const combos = calculateWinningScores(board, [1]);
  assert.strictEqual(combos.length, 4); // 2 x-digits × 2 y-digits
  for (const combo of combos) {
    assert.strictEqual(combo.exampleScores.length, 6);
    const distinctX = new Set(combo.exampleScores.map(s => s.x));
    assert.ok(distinctX.size > 1, 'examples should vary across both teams');
    for (const s of combo.exampleScores) {
      assert.strictEqual(s.x % 10, combo.xTeamDigit);
      assert.strictEqual(s.y % 10, combo.yTeamDigit);
    }
  }
});

test('calculateWinningScores skips unknown square numbers', () => {
  const board = makeGridBoard('10x10');
  assert.deepStrictEqual(calculateWinningScores(board, [999]), []);
});

test('isValidAxisPermutation', () => {
  assert.ok(isValidAxisPermutation([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  assert.ok(isValidAxisPermutation([9, 3, 0, 4, 1, 8, 2, 7, 5, 6]));
  assert.ok(!isValidAxisPermutation([0, 1, 2, 3, 4, 5, 6, 7, 8, 8]));
  assert.ok(!isValidAxisPermutation([0, 1, 2, 3, 4]));
  assert.ok(!isValidAxisPermutation(null));
  assert.ok(!isValidAxisPermutation('0123456789'));
});
