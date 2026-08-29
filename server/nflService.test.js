const test = require('node:test');
const assert = require('node:assert');
const {
  espnStatusToGamePhase,
  simplifyCompetition,
  simplifyScoreboard,
  applyGameToBoard,
  completedPeriodScores
} = require('./nflService');

function status(state, name, period, clock) {
  return { type: { state, name, shortDetail: name }, period, displayClock: clock };
}

// Shape mirrors ESPN's site API scoreboard events
function espnEvent(overrides = {}) {
  return {
    id: '401772988',
    name: 'Seattle Seahawks at New England Patriots',
    shortName: 'SEA VS NE',
    date: '2026-02-08T23:30Z',
    competitions: [{
      id: '401772988',
      date: '2026-02-08T23:30Z',
      status: overrides.status || status('in', 'STATUS_IN_PROGRESS', 3, '5:24'),
      competitors: [
        { homeAway: 'home', score: overrides.homeScore ?? '13', team: { displayName: 'New England Patriots', abbreviation: 'NE' } },
        { homeAway: 'away', score: overrides.awayScore ?? '29', team: { displayName: 'Seattle Seahawks', abbreviation: 'SEA' } }
      ]
    }]
  };
}

test('espnStatusToGamePhase maps every game state', () => {
  assert.strictEqual(espnStatusToGamePhase(status('pre', 'STATUS_SCHEDULED', 0)), 'pre-game');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_IN_PROGRESS', 1)), '1st Quarter');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_IN_PROGRESS', 2)), '2nd Quarter');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_HALFTIME', 2)), 'Halftime');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_END_PERIOD', 2)), 'Halftime');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_IN_PROGRESS', 3)), '3rd Quarter');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_IN_PROGRESS', 4)), '4th Quarter');
  assert.strictEqual(espnStatusToGamePhase(status('in', 'STATUS_IN_PROGRESS', 5)), 'Overtime');
  assert.strictEqual(espnStatusToGamePhase(status('post', 'STATUS_FINAL', 4)), 'Final');
  assert.strictEqual(espnStatusToGamePhase(status('post', 'STATUS_FINAL_OVERTIME', 5)), 'Final');
  // Missing/partial data defaults safely
  assert.strictEqual(espnStatusToGamePhase(undefined), '1st Quarter');
  assert.strictEqual(espnStatusToGamePhase({}), '1st Quarter');
});

test('simplifyScoreboard extracts games with scores as numbers', () => {
  const { games } = simplifyScoreboard({ events: [espnEvent()] });
  assert.strictEqual(games.length, 1);
  const game = games[0];
  assert.strictEqual(game.id, '401772988');
  assert.strictEqual(game.home.abbreviation, 'NE');
  assert.strictEqual(game.home.score, 13);
  assert.strictEqual(game.away.score, 29);
  assert.strictEqual(game.gamePhase, '3rd Quarter');
  assert.strictEqual(game.clock, '5:24');
});

test('simplifyScoreboard skips malformed events and handles empty payloads', () => {
  assert.deepStrictEqual(simplifyScoreboard({}), { games: [] });
  const { games } = simplifyScoreboard({ events: [{ id: 'x', competitions: [{ competitors: [] }] }, espnEvent()] });
  assert.strictEqual(games.length, 1);
});

test('simplifyCompetition builds a name when the event has none (summary shape)', () => {
  const comp = espnEvent().competitions[0];
  const game = simplifyCompetition(comp, { id: '401772988' });
  assert.strictEqual(game.name, 'Seattle Seahawks at New England Patriots');
  assert.strictEqual(game.shortName, 'SEA @ NE');
});

test('simplifyCompetition tolerates a final with no period/clock (as ESPN returns)', () => {
  const comp = espnEvent({ status: { type: { state: 'post', name: 'STATUS_FINAL', shortDetail: 'Final' } } }).competitions[0];
  const game = simplifyCompetition(comp, {});
  assert.strictEqual(game.gamePhase, 'Final');
  assert.strictEqual(game.period, 0);
  assert.strictEqual(game.clock, '');
});

test('applyGameToBoard maps home/away onto x/y by xTeamSide', () => {
  const { games } = simplifyScoreboard({ events: [espnEvent()] });
  const game = games[0];

  // Board where x-team is the AWAY team (Seahawks)
  const board = {
    liveGame: { eventId: '401772988', xTeamSide: 'away' },
    currentScore: { xTeam: 0, yTeam: 0 },
    gamePhase: 'pre-game'
  };
  applyGameToBoard(board, game);
  assert.strictEqual(board.currentScore.xTeam, 29);
  assert.strictEqual(board.currentScore.yTeam, 13);
  assert.strictEqual(board.gamePhase, '3rd Quarter');
  assert.strictEqual(board.liveGame.lastSync.state, 'in');
  assert.strictEqual(board.liveGame.lastSync.clock, '5:24');

  // Same game, x-team is HOME — scores flip
  const board2 = { liveGame: { eventId: '401772988', xTeamSide: 'home' } };
  applyGameToBoard(board2, game);
  assert.strictEqual(board2.currentScore.xTeam, 13);
  assert.strictEqual(board2.currentScore.yTeam, 29);
});

// ----- completedPeriodScores -----

function liveGame({ state, period, gamePhase, homeLines, awayLines, homeScore, awayScore }) {
  return {
    state,
    period,
    gamePhase,
    home: { name: 'Denver Broncos', score: homeScore, linescores: homeLines },
    away: { name: 'Minnesota Vikings', score: awayScore, linescores: awayLines }
  };
}

test('completedPeriodScores: mid-Q2 yields exact Q1 score despite Q2 points', () => {
  const game = liveGame({
    state: 'in', period: 2, gamePhase: '2nd Quarter',
    homeLines: [7, 7], awayLines: [3, 0], homeScore: 14, awayScore: 3
  });
  assert.deepStrictEqual(completedPeriodScores(game), { q1: { home: 7, away: 3 } });
});

test('completedPeriodScores: halftime adds the half score', () => {
  const game = liveGame({
    state: 'in', period: 2, gamePhase: 'Halftime',
    homeLines: [7, 6], awayLines: [3, 0], homeScore: 13, awayScore: 3
  });
  assert.deepStrictEqual(completedPeriodScores(game), {
    q1: { home: 7, away: 3 },
    half: { home: 13, away: 3 }
  });
});

test('completedPeriodScores: final uses live totals (overtime included)', () => {
  const game = liveGame({
    state: 'post', period: 5, gamePhase: 'Final',
    homeLines: [7, 6, 0, 7, 6], awayLines: [3, 0, 7, 10, 0], homeScore: 26, awayScore: 20
  });
  assert.deepStrictEqual(completedPeriodScores(game), {
    q1: { home: 7, away: 3 },
    half: { home: 13, away: 3 },
    q3: { home: 13, away: 10 },
    final: { home: 26, away: 20 }
  });
});

test('completedPeriodScores: missing linescores only yields final when post', () => {
  const inProgress = liveGame({
    state: 'in', period: 3, gamePhase: '3rd Quarter',
    homeLines: [], awayLines: [], homeScore: 13, awayScore: 3
  });
  assert.deepStrictEqual(completedPeriodScores(inProgress), {});

  const done = liveGame({
    state: 'post', period: 4, gamePhase: 'Final',
    homeLines: [], awayLines: [], homeScore: 26, awayScore: 20
  });
  assert.deepStrictEqual(completedPeriodScores(done), { final: { home: 26, away: 20 } });
});

test('completedPeriodScores: nothing during Q1', () => {
  const game = liveGame({
    state: 'in', period: 1, gamePhase: '1st Quarter',
    homeLines: [7], awayLines: [0], homeScore: 7, awayScore: 0
  });
  assert.deepStrictEqual(completedPeriodScores(game), {});
});
