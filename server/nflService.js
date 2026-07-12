// Live NFL scores via ESPN's public site API.
// Endpoints documented at https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

// Multiple viewers poll every ~30s; a short cache keeps us from hammering
// ESPN with identical requests from the same server instance.
const CACHE_TTL_MS = 20 * 1000;
const cache = new Map(); // key -> { data, fetchedAt }

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, fetchedAt: Date.now() });
  // Drop stale entries so a long-lived process doesn't accumulate old dates
  if (cache.size > 20) {
    for (const [k, v] of cache) {
      if (Date.now() - v.fetchedAt >= CACHE_TTL_MS) cache.delete(k);
    }
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`ESPN API error: HTTP ${response.status}`);
  }
  return response.json();
}

// Map an ESPN competition status to this app's gamePhase strings.
function espnStatusToGamePhase(status) {
  const state = status?.type?.state; // 'pre' | 'in' | 'post'
  const name = status?.type?.name || '';
  const period = status?.period || 0;

  if (state === 'pre') return 'pre-game';
  if (state === 'post') return 'Final';
  if (name === 'STATUS_HALFTIME') return 'Halftime';
  if (name === 'STATUS_END_PERIOD' && period === 2) return 'Halftime';
  if (period <= 1) return '1st Quarter';
  if (period === 2) return '2nd Quarter';
  if (period === 3) return '3rd Quarter';
  if (period === 4) return '4th Quarter';
  return 'Overtime';
}

// Normalize one ESPN competition into the shape the app consumes.
// Works for both scoreboard events and summary headers.
function simplifyCompetition(competition, fallback = {}) {
  if (!competition) return null;
  const home = (competition.competitors || []).find(c => c.homeAway === 'home');
  const away = (competition.competitors || []).find(c => c.homeAway === 'away');
  if (!home || !away) return null;

  const status = competition.status || fallback.status || {};
  const homeName = home.team?.displayName || home.team?.name || 'Home';
  const awayName = away.team?.displayName || away.team?.name || 'Away';

  return {
    id: String(competition.id || fallback.id || ''),
    name: fallback.name || `${awayName} at ${homeName}`,
    shortName: fallback.shortName || `${away.team?.abbreviation || 'AWAY'} @ ${home.team?.abbreviation || 'HOME'}`,
    date: competition.date || fallback.date || null,
    state: status.type?.state || 'pre',
    detail: status.type?.shortDetail || '',
    period: status.period || 0,
    clock: status.displayClock || '',
    gamePhase: espnStatusToGamePhase(status),
    home: {
      name: homeName,
      abbreviation: home.team?.abbreviation || '',
      score: parseInt(home.score, 10) || 0
    },
    away: {
      name: awayName,
      abbreviation: away.team?.abbreviation || '',
      score: parseInt(away.score, 10) || 0
    }
  };
}

function simplifyScoreboard(raw) {
  const games = (raw.events || [])
    .map(event => simplifyCompetition(event.competitions?.[0], {
      id: event.id,
      name: event.name,
      shortName: event.shortName,
      date: event.date,
      status: event.status
    }))
    .filter(Boolean);
  return { games };
}

// List games. `dates` is an optional YYYYMMDD string; without it ESPN
// returns the current week's scoreboard.
async function getScoreboard(dates) {
  const key = `scoreboard:${dates || 'current'}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = dates ? `${SCOREBOARD_URL}?dates=${encodeURIComponent(dates)}` : SCOREBOARD_URL;
  const data = simplifyScoreboard(await fetchJson(url));
  setCached(key, data);
  return data;
}

// Fetch a single game's current state by ESPN event id.
async function getGame(eventId) {
  const key = `game:${eventId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const raw = await fetchJson(`${SUMMARY_URL}?event=${encodeURIComponent(eventId)}`);
  const competition = raw.header?.competitions?.[0];
  const game = simplifyCompetition(competition, { id: raw.header?.id });
  if (!game) {
    throw new Error('Game not found or ESPN response missing competitors');
  }
  game.id = String(raw.header?.id || eventId);
  setCached(key, game);
  return game;
}

// Copy a live game's score and phase onto a board (mutates the board).
// board.liveGame.xTeamSide says whether the board's x-team is ESPN's
// home or away side.
function applyGameToBoard(board, game) {
  const xSide = board.liveGame?.xTeamSide === 'away' ? 'away' : 'home';
  const x = xSide === 'home' ? game.home : game.away;
  const y = xSide === 'home' ? game.away : game.home;

  if (!board.currentScore) board.currentScore = { xTeam: 0, yTeam: 0 };
  board.currentScore.xTeam = x.score;
  board.currentScore.yTeam = y.score;
  board.gamePhase = game.gamePhase;
  board.liveGame.lastSync = {
    at: new Date().toISOString(),
    state: game.state,
    detail: game.detail,
    period: game.period,
    clock: game.clock
  };
  return board;
}

module.exports = {
  getScoreboard,
  getGame,
  applyGameToBoard,
  espnStatusToGamePhase,
  simplifyCompetition,
  simplifyScoreboard
};
