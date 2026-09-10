const test = require('node:test');
const assert = require('node:assert');
const {
  strip10BlocksFromPermutations,
  generateStrip10Assignments,
  boardHasAxes,
  findWinningSquares,
  checkCurrentWinners,
  calculateWinningScores,
  latestCompletedPeriod,
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

// ----- latestCompletedPeriod -----

test('latestCompletedPeriod maps single-step phase advances to the finished period', () => {
  assert.strictEqual(latestCompletedPeriod('1st Quarter', '2nd Quarter'), 'q1');
  assert.strictEqual(latestCompletedPeriod('2nd Quarter', 'Halftime'), 'half');
  assert.strictEqual(latestCompletedPeriod('Halftime', '3rd Quarter'), null);
  assert.strictEqual(latestCompletedPeriod('3rd Quarter', '4th Quarter'), 'q3');
  assert.strictEqual(latestCompletedPeriod('4th Quarter', 'Final'), 'final');
  assert.strictEqual(latestCompletedPeriod('4th Quarter', 'Overtime'), null);
  assert.strictEqual(latestCompletedPeriod('Overtime', 'Final'), 'final');
});

test('latestCompletedPeriod on a jump records only the boundary the score belongs to', () => {
  // Skipping halftime: the submitted score is the start-of-3rd score
  assert.strictEqual(latestCompletedPeriod('2nd Quarter', '3rd Quarter'), 'half');
  // Jumping straight to Final: only the final score is known
  assert.strictEqual(latestCompletedPeriod('1st Quarter', 'Final'), 'final');
  assert.strictEqual(latestCompletedPeriod('pre-game', '1st Quarter'), null);
});

test('latestCompletedPeriod ignores no-ops, reversals, and unknown phases', () => {
  assert.strictEqual(latestCompletedPeriod('2nd Quarter', '2nd Quarter'), null);
  assert.strictEqual(latestCompletedPeriod('Final', '3rd Quarter'), null);
  assert.strictEqual(latestCompletedPeriod('weird', 'Final'), null);
  assert.strictEqual(latestCompletedPeriod('1st Quarter', 'nonsense'), null);
});

// ----- strip-10 draw-later flow -----

test('strip10BlocksFromPermutations assigns spots in reading order', () => {
  // The Bomb Sports sheet: Jets 4 1 2 7 6 | 5 0 3 8 9, Giants pairs 3-0, 9-5, 1-8, 4-6, 7-2
  const blocks = strip10BlocksFromPermutations(
    [4, 1, 2, 7, 6, 5, 0, 3, 8, 9],
    [3, 0, 9, 5, 1, 8, 4, 6, 7, 2]
  );
  assert.strictEqual(blocks.length, 10);
  assert.deepStrictEqual(blocks[0], { xDigits: [1, 2, 4, 6, 7], yDigits: [0, 3] }); // spot 1
  assert.deepStrictEqual(blocks[1], { xDigits: [0, 3, 5, 8, 9], yDigits: [0, 3] }); // spot 2
  assert.deepStrictEqual(blocks[2], { xDigits: [1, 2, 4, 6, 7], yDigits: [5, 9] }); // spot 3
  assert.deepStrictEqual(blocks[9], { xDigits: [0, 3, 5, 8, 9], yDigits: [2, 7] }); // spot 10
});

test('strip10BlocksFromPermutations partitions all 100 score combos exactly once', () => {
  const blocks = strip10BlocksFromPermutations(
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
  const seen = new Set();
  for (const block of blocks) {
    for (const x of block.xDigits) {
      for (const y of block.yDigits) {
        seen.add(`${x}-${y}`);
      }
    }
  }
  assert.strictEqual(seen.size, 100);
});

test('boardHasAxes: strip boards are drawn only once every square has digits', () => {
  const drawn = {
    type: 'strip-10',
    squares: strip10BlocksFromPermutations(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    ).map((b, i) => ({ number: i + 1, ...b }))
  };
  assert.strictEqual(boardHasAxes(drawn), true);

  const pending = {
    type: 'strip-10',
    squares: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, xDigits: [], yDigits: [] }))
  };
  assert.strictEqual(boardHasAxes(pending), false);
  assert.strictEqual(boardHasAxes({ type: 'strip-10', squares: [] }), false);

  // Winners never compute on a pending strip
  pending.currentScore = { xTeam: 13, yTeam: 3 };
  pending.gamePhase = '2nd Quarter';
  assert.deepStrictEqual(findWinningSquares(pending), []);
});
