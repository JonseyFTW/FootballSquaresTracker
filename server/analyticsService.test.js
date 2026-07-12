const test = require('node:test');
const assert = require('node:assert');
const { computeAnalytics } = require('./analyticsService');

function board(id, overrides = {}) {
  return {
    id,
    name: `Board ${id}`,
    xTeamName: 'Chiefs',
    yTeamName: 'Eagles',
    gamePhase: 'Final',
    squarePrice: 10,
    prizes: { q1: 50, half: 100, q3: 50, final: 200 },
    periodResults: {},
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

test('computes wins, winnings, and rates from period results', () => {
  const boards = {
    b1: board('b1', {
      periodResults: {
        q1: { winners: [{ squareNumber: 5, owner: 'Chad' }], score: { xTeam: 7, yTeam: 3 }, recordedAt: '2026-01-01T01:00:00Z' },
        half: { winners: [{ squareNumber: 99, owner: 'Sam' }], score: { xTeam: 14, yTeam: 10 }, recordedAt: '2026-01-01T02:00:00Z' },
        final: { winners: [{ squareNumber: 12, owner: 'Chad' }], score: { xTeam: 24, yTeam: 20 }, recordedAt: '2026-01-01T03:00:00Z' }
      }
    })
  };
  const tracked = [{ boardId: 'b1', squares: [5, 12, 30], updatedAt: '2026-01-01T00:30:00Z' }];

  const result = computeAnalytics(tracked, boards);

  assert.strictEqual(result.totals.gamesPlayed, 1);
  assert.strictEqual(result.totals.squaresTracked, 3);
  assert.strictEqual(result.totals.periodsPlayed, 3);
  assert.strictEqual(result.totals.wins, 2); // q1 (sq 5) + final (sq 12)
  assert.strictEqual(result.totals.totalWinnings, 250); // 50 + 200
  assert.strictEqual(result.totals.totalSpent, 30); // 3 squares × $10
  assert.strictEqual(result.totals.net, 220);
  assert.ok(Math.abs(result.totals.winRate - 2 / 3) < 1e-9);

  assert.strictEqual(result.wins.length, 2);
  // Sorted newest first
  assert.strictEqual(result.wins[0].period, 'final');
  assert.strictEqual(result.wins[0].amount, 200);
});

test('skips deleted boards and empty square lists gracefully', () => {
  const tracked = [
    { boardId: 'gone', squares: [1] },
    { boardId: 'b2', squares: [] },
    { boardId: 'b3', squares: ['x', null] }
  ];
  const boards = { gone: undefined, b2: board('b2'), b3: board('b3') };
  const result = computeAnalytics(tracked, boards);
  assert.strictEqual(result.totals.gamesPlayed, 0);
  assert.strictEqual(result.totals.wins, 0);
  assert.strictEqual(result.totals.winRate, 0);
});

test('a recorded period with no winners counts as played but not won', () => {
  const boards = {
    b1: board('b1', {
      periodResults: {
        q1: { winners: [], score: { xTeam: 0, yTeam: 5 }, recordedAt: '2026-01-01T01:00:00Z' }
      }
    })
  };
  const result = computeAnalytics([{ boardId: 'b1', squares: [1, 2] }], boards);
  assert.strictEqual(result.totals.periodsPlayed, 1);
  assert.strictEqual(result.totals.wins, 0);
  assert.strictEqual(result.games[0].periods[0].won, false);
});

test('missing prize amounts count as $0 wins', () => {
  const boards = {
    b1: board('b1', {
      prizes: {},
      periodResults: {
        final: { winners: [{ squareNumber: 1 }], score: { xTeam: 10, yTeam: 10 }, recordedAt: '2026-01-01T01:00:00Z' }
      }
    })
  };
  const result = computeAnalytics([{ boardId: 'b1', squares: [1] }], boards);
  assert.strictEqual(result.totals.wins, 1);
  assert.strictEqual(result.totals.totalWinnings, 0);
});

test('deduplicates tracked squares before scoring', () => {
  const boards = {
    b1: board('b1', {
      periodResults: {
        q1: { winners: [{ squareNumber: 5 }], score: { xTeam: 5, yTeam: 5 }, recordedAt: '2026-01-01T01:00:00Z' }
      }
    })
  };
  const result = computeAnalytics([{ boardId: 'b1', squares: [5, 5, 5] }], boards);
  assert.strictEqual(result.totals.squaresTracked, 1);
  assert.strictEqual(result.totals.wins, 1);
});
