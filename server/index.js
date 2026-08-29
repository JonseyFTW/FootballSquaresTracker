require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { parseImage, DEFAULT_OPENROUTER_MODEL } = require('./llmService');
const { getScoreboard, getGame, applyGameToBoard, completedPeriodScores } = require('./nflService');
const storage = require('./storage');
const auth = require('./authService');
const { sendPasswordResetEmail } = require('./emailService');
const { runDailyCampaigns } = require('./emailCampaigns');
const { verifyGoogleIdToken } = require('./googleAuth');
const { computeAnalytics } = require('./analyticsService');
const {
  shuffle,
  strip10BlocksFromPermutations,
  generateStrip10Assignments,
  boardHasAxes,
  findWinningSquares,
  checkCurrentWinners,
  calculateWinningScores,
  latestCompletedPeriod,
  isValidAxisPermutation
} = require('./gameLogic');

// API keys from environment
const API_KEYS = {
  gemini: process.env.GEMINI_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  claude: process.env.CLAUDE_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY
};

const BOARD_TYPES = ['5x5', '10x10', 'strip-10'];
const LLM_PROVIDERS = ['gemini', 'openai', 'claude', 'openrouter'];
// OpenRouter model ids look like "vendor/model-name[:variant]"
const OPENROUTER_MODEL_RE = /^[\w.\-\/:]{1,100}$/;
const PERIODS = ['q1', 'half', 'q3', 'final'];
const MAX_OWNER_LENGTH = 60;
const MAX_PHASE_LENGTH = 30;
const MAX_DRAW_RUNS = 25;

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Attach the authenticated user (if any) to every request
app.use(async (req, res, next) => {
  req.user = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const payload = auth.verifyToken(header.slice(7));
    if (payload) {
      try {
        req.user = await storage.getUserById(payload.userId);
      } catch (err) {
        console.error('Auth lookup failed:', err);
      }
    }
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  next();
}

// Boards created before accounts existed have no owner and stay fully
// open (backward compatibility). Owned boards are editable only by
// their owner.
function canEditBoard(board, user) {
  if (!board.ownerId) return true;
  return !!user && user.id === board.ownerId;
}

// What the client is allowed to know about an account. isAdmin (from the
// ADMIN_EMAILS allowlist) gates owner-only pages like the Pricing Lab.
function userPayload(user) {
  return { ...auth.publicUser(user), isAdmin: auth.isAdminEmail(user.email) };
}

// Public origin for links in emails (APP_URL wins so links never point
// at a preview deployment's hostname).
function getOrigin(req) {
  return process.env.APP_URL ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// ============================================================
// Input sanitizers
// ============================================================

function sanitizeOwner(owner) {
  if (typeof owner !== 'string') return '';
  return owner.trim().slice(0, MAX_OWNER_LENGTH);
}

function sanitizeDigits(digits) {
  if (!Array.isArray(digits)) return null;
  const clean = [...new Set(
    digits.map(d => parseInt(d, 10)).filter(d => !isNaN(d) && d >= 0 && d <= 9)
  )].sort((a, b) => a - b);
  return clean.length > 0 ? clean : null;
}

function sanitizeName(value, max = 100) {
  return String(value || '').trim().slice(0, max);
}

// Board summary for lists and public league pages
function boardSummary(board) {
  return {
    id: board.id,
    name: board.name,
    type: board.type,
    xTeamName: board.xTeamName,
    yTeamName: board.yTeamName,
    gamePhase: board.gamePhase,
    currentScore: board.currentScore,
    createdAt: board.createdAt,
    leagueId: board.leagueId || null,
    leagueName: board.leagueName || null,
    ownerId: board.ownerId || null,
    shareToken: board.shareToken || null,
    axesDrawn: boardHasAxes(board),
    squarePrice: board.squarePrice || 0,
    liveGame: board.liveGame ? { gameName: board.liveGame.gameName, lastSync: board.liveGame.lastSync } : null,
    filledSquares: (board.squares || []).filter(s => s.owner).length,
    totalSquares: (board.squares || []).length
  };
}

// ============================================================
// Health
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    storage: storage.usePostgres ? 'postgres' : (storage.useInMemory ? 'memory' : 'file'),
    persistent: storage.usePostgres || !process.env.VERCEL
  });
});

// ============================================================
// Auth & account
// ============================================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const email = auth.normalizeEmail(req.body.email);
    const name = sanitizeName(req.body.name, 60);
    const password = String(req.body.password || '');

    if (!auth.isValidEmail(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Enter your name' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = {
      id: uuidv4(),
      email,
      name,
      passwordHash: auth.hashPassword(password),
      trackedGames: [],
      createdAt: new Date().toISOString()
    };
    await storage.saveUser(user);

    res.status(201).json({ token: auth.signToken(user.id), user: userPayload(user) });
  } catch (error) {
    console.error('Error registering:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = auth.normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    const user = await storage.getUserByEmail(email);
    if (!user || !auth.verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ token: auth.signToken(user.id), user: userPayload(user) });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: userPayload(req.user) });
});

// Public auth configuration for the client (which providers to offer)
app.get('/api/auth/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// Sign in with Google: the client posts the GIS credential (a signed
// ID token); we verify it and link-or-create the account by verified
// email, then issue our normal session token.
app.post('/api/auth/google', async (req, res) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: 'Google sign-in is not configured' });
    }

    const identity = await verifyGoogleIdToken(req.body.credential);
    if (!identity) {
      return res.status(401).json({ error: "Google sign-in couldn't be verified — try again" });
    }

    const email = auth.normalizeEmail(identity.email);
    let user = await storage.getUserByEmail(email);

    if (user) {
      // Existing account (password or Google) — link the Google id once.
      // Safe because Google guarantees the email is verified.
      if (!user.googleId) {
        user.googleId = identity.googleId;
        await storage.saveUser(user);
      }
    } else {
      user = {
        id: uuidv4(),
        email,
        name: sanitizeName(identity.name, 60) || email.split('@')[0],
        googleId: identity.googleId,
        authProvider: 'google',
        trackedGames: [],
        createdAt: new Date().toISOString()
      };
      await storage.saveUser(user);
    }

    res.json({ token: auth.signToken(user.id), user: userPayload(user) });
  } catch (error) {
    console.error('Error with Google sign-in:', error);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

// Request a password reset link. The response never reveals whether an
// account exists for the email.
app.post('/api/auth/forgot', async (req, res) => {
  const generic = { message: 'If an account exists for that email, a reset link is on its way.' };
  try {
    const email = auth.normalizeEmail(req.body.email);
    if (!auth.isValidEmail(email)) {
      return res.json(generic);
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.json(generic);
    }

    // Per-account cooldown so this endpoint can't flood a mailbox
    const now = Date.now();
    if (user.lastResetRequestAt && now - new Date(user.lastResetRequestAt).getTime() < 60 * 1000) {
      return res.json(generic);
    }
    user.lastResetRequestAt = new Date(now).toISOString();
    await storage.saveUser(user);

    const token = auth.signResetToken(user.id, user.passwordHash);
    const resetUrl = `${getOrigin(req)}/reset?token=${encodeURIComponent(token)}`;

    try {
      const result = await sendPasswordResetEmail(user.email, resetUrl);
      if (!result.sent) {
        // No email provider configured — surface the link in server logs
        // so the operator can hand it to the user manually.
        console.log(`[password-reset] Email not configured. Link for ${user.email}: ${resetUrl}`);
      }
    } catch (err) {
      console.error('Failed to send reset email:', err.message);
      console.log(`[password-reset] Link for ${user.email}: ${resetUrl}`);
    }

    res.json(generic);
  } catch (error) {
    console.error('Error handling forgot-password:', error);
    res.json(generic);
  }
});

// Complete a reset: token + new password. Signs the user in on success.
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { token } = req.body;
    const password = String(req.body.password || '');

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const invalid = () => res.status(400).json({
      error: 'This reset link is invalid, expired, or already used. Request a new one.'
    });

    const payload = auth.verifyResetToken(token);
    if (!payload) return invalid();

    const user = await storage.getUserById(payload.userId);
    // pwv binds the token to the password it was issued against, so a
    // completed reset (or any password change) kills outstanding links
    if (!user || auth.passwordVersion(user.passwordHash) !== payload.pwv) return invalid();

    user.passwordHash = auth.hashPassword(password);
    await storage.saveUser(user);

    res.json({ token: auth.signToken(user.id), user: userPayload(user) });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================
// Email campaigns (weekly board reminders, season-start)
// ============================================================

// Hit daily by Vercel Cron (vercel.json "crons"). Vercel sends
// "Authorization: Bearer $CRON_SECRET" automatically when the env var is
// set; unset means the endpoint stays off. ?dryRun=1 reports who would
// get what today without sending or recording anything.
app.get('/api/cron/emails', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'CRON_SECRET is not configured' });
    }
    const header = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (header.length !== expected.length || !crypto.timingSafeEqual(header, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await runDailyCampaigns({
      origin: getOrigin(req),
      dryRun: req.query.dryRun === '1'
    });
    res.json(result);
  } catch (error) {
    console.error('Email campaign run failed:', error);
    res.status(500).json({ error: 'Email campaign run failed' });
  }
});

// Unsubscribe link target. GET renders a small confirmation page (that's
// what mail clients open); POST handles RFC 8058 one-click unsubscribe.
// The signed token identifies the user, so this needs no session.
async function handleUnsubscribe(req, res) {
  const wantsHtml = req.method === 'GET';
  const page = (title, message) => `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — SquareSZN</title></head>
    <body style="margin:0;background:#070b14;color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;display:flex;justify-content:center;padding:60px 20px">
      <div style="max-width:420px;text-align:center">
        <p style="font-size:20px;font-weight:bold">🏈 Square<span style="color:#ff5a28">SZN</span></p>
        <h2 style="margin:18px 0 10px">${title}</h2>
        <p style="color:#94a3b8;line-height:1.6">${message}</p>
        <p style="margin-top:26px"><a href="/" style="color:#ff7a18;font-weight:bold">Back to SquareSZN</a></p>
      </div>
    </body></html>`;

  const fail = () => wantsHtml
    ? res.status(400).send(page('Link expired', 'This unsubscribe link is invalid or expired. Use the link from a more recent email.'))
    : res.status(400).json({ error: 'Invalid unsubscribe token' });

  try {
    const payload = auth.verifyUnsubscribeToken(req.query.token);
    if (!payload) return fail();

    const user = await storage.getUserById(payload.userId);
    if (!user) return fail();

    const resubscribe = req.query.action === 'resubscribe';
    user.emailOptOut = !resubscribe;
    await storage.saveUser(user);

    if (!wantsHtml) return res.json({ ok: true });

    if (resubscribe) {
      return res.send(page("You're back in", "We'll keep sending you the weekly board reminders during football season."));
    }
    const resubUrl = `/api/email/unsubscribe?token=${encodeURIComponent(req.query.token)}&action=resubscribe`;
    return res.send(page(
      "You're unsubscribed",
      `No more reminder emails from SquareSZN. Password resets still work. Changed your mind? <a href="${resubUrl}" style="color:#ff7a18">Resubscribe</a>.`
    ));
  } catch (error) {
    console.error('Unsubscribe failed:', error);
    return fail();
  }
}

app.get('/api/email/unsubscribe', handleUnsubscribe);
app.post('/api/email/unsubscribe', handleUnsubscribe);

// Save/update the squares a user is tracking on a board (their "entry"
// in that game). Empty squares removes the entry.
app.put('/api/me/tracked', requireAuth, async (req, res) => {
  try {
    const { boardId, squares } = req.body;
    if (!boardId) {
      return res.status(400).json({ error: 'boardId is required' });
    }

    const clean = [...new Set((Array.isArray(squares) ? squares : [])
      .map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0))];

    const user = req.user;
    user.trackedGames = (user.trackedGames || []).filter(t => t.boardId !== boardId);
    if (clean.length > 0) {
      user.trackedGames.push({ boardId, squares: clean, updatedAt: new Date().toISOString() });
    }
    await storage.saveUser(user);
    res.json({ trackedGames: user.trackedGames });
  } catch (error) {
    console.error('Error saving tracked squares:', error);
    res.status(500).json({ error: 'Failed to save tracked squares' });
  }
});

app.get('/api/me/tracked', requireAuth, (req, res) => {
  res.json({ trackedGames: req.user.trackedGames || [] });
});

app.get('/api/me/analytics', requireAuth, async (req, res) => {
  try {
    const tracked = req.user.trackedGames || [];
    const boardsById = {};
    for (const t of tracked) {
      boardsById[t.boardId] = await storage.getBoardById(t.boardId);
    }
    res.json(computeAnalytics(tracked, boardsById));
  } catch (error) {
    console.error('Error computing analytics:', error);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

// ============================================================
// Leagues
// ============================================================

app.post('/api/leagues', requireAuth, async (req, res) => {
  try {
    const name = sanitizeName(req.body.name, 80);
    if (!name) {
      return res.status(400).json({ error: 'League name is required' });
    }

    const league = {
      id: uuidv4(),
      name,
      description: sanitizeName(req.body.description, 300),
      ownerId: req.user.id,
      ownerName: req.user.name,
      members: [],
      shareToken: uuidv4(),
      createdAt: new Date().toISOString()
    };
    await storage.saveLeague(league);
    res.status(201).json(league);
  } catch (error) {
    console.error('Error creating league:', error);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

app.get('/api/leagues', requireAuth, async (req, res) => {
  try {
    const leagues = await storage.getLeaguesByOwnerId(req.user.id);
    res.json(leagues);
  } catch (error) {
    console.error('Error listing leagues:', error);
    res.status(500).json({ error: 'Failed to list leagues' });
  }
});

// Load a league (owner only) with its boards
async function loadOwnedLeague(req, res) {
  const league = await storage.getLeagueById(req.params.id);
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return null;
  }
  if (!req.user || league.ownerId !== req.user.id) {
    res.status(403).json({ error: 'Only the league owner can do this' });
    return null;
  }
  return league;
}

app.get('/api/leagues/:id', requireAuth, async (req, res) => {
  try {
    const league = await loadOwnedLeague(req, res);
    if (!league) return;
    const boards = await storage.getBoardsByLeagueId(league.id);
    res.json({ ...league, boards: boards.map(boardSummary) });
  } catch (error) {
    console.error('Error loading league:', error);
    res.status(500).json({ error: 'Failed to load league' });
  }
});

app.put('/api/leagues/:id', requireAuth, async (req, res) => {
  try {
    const league = await loadOwnedLeague(req, res);
    if (!league) return;
    if (req.body.name !== undefined) {
      const name = sanitizeName(req.body.name, 80);
      if (!name) return res.status(400).json({ error: 'League name cannot be empty' });
      league.name = name;
    }
    if (req.body.description !== undefined) {
      league.description = sanitizeName(req.body.description, 300);
    }
    await storage.saveLeague(league);
    res.json(league);
  } catch (error) {
    console.error('Error updating league:', error);
    res.status(500).json({ error: 'Failed to update league' });
  }
});

app.delete('/api/leagues/:id', requireAuth, async (req, res) => {
  try {
    const league = await loadOwnedLeague(req, res);
    if (!league) return;

    // Detach the league's boards rather than deleting people's games
    const boards = await storage.getBoardsByLeagueId(league.id);
    for (const board of boards) {
      delete board.leagueId;
      delete board.leagueName;
      await storage.saveBoard(board);
    }

    await storage.removeLeagueById(league.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting league:', error);
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

app.post('/api/leagues/:id/members', requireAuth, async (req, res) => {
  try {
    const league = await loadOwnedLeague(req, res);
    if (!league) return;

    const name = sanitizeName(req.body.name, 60);
    if (!name) {
      return res.status(400).json({ error: 'Member name is required' });
    }
    if ((league.members || []).some(m => m.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'That name is already on the roster' });
    }

    league.members = league.members || [];
    league.members.push({ id: uuidv4(), name, addedAt: new Date().toISOString() });
    await storage.saveLeague(league);
    res.json(league);
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

app.delete('/api/leagues/:id/members/:memberId', requireAuth, async (req, res) => {
  try {
    const league = await loadOwnedLeague(req, res);
    if (!league) return;
    league.members = (league.members || []).filter(m => m.id !== req.params.memberId);
    await storage.saveLeague(league);
    res.json(league);
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Public league page (read-only, by share token)
app.get('/api/league-share/:token', async (req, res) => {
  try {
    const league = await storage.getLeagueByShareToken(req.params.token);
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }
    const boards = await storage.getBoardsByLeagueId(league.id);
    res.json({
      league: { name: league.name, description: league.description, ownerName: league.ownerName },
      boards: boards.map(boardSummary)
    });
  } catch (error) {
    console.error('Error loading shared league:', error);
    res.status(500).json({ error: 'Failed to load league' });
  }
});

// ============================================================
// NFL live scores
// ============================================================

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

// ============================================================
// Boards
// ============================================================

// List boards: legacy open boards plus the signed-in user's boards
app.get('/api/boards', async (req, res) => {
  try {
    const boards = await storage.getAllBoards();
    const visible = boards.filter(b => !b.ownerId || (req.user && b.ownerId === req.user.id));
    res.json(visible);
  } catch (error) {
    console.error('Error loading boards:', error);
    res.status(500).json({ error: 'Failed to load boards' });
  }
});

app.get('/api/boards/:id', async (req, res) => {
  try {
    const board = await storage.getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    // Owned boards are private to their owner; sharing goes through
    // the read-only share link instead.
    if (board.ownerId && (!req.user || req.user.id !== board.ownerId)) {
      return res.status(403).json({ error: 'This board is private. Ask the owner for a share link.' });
    }
    res.json({ ...board, canEdit: canEditBoard(board, req.user) });
  } catch (error) {
    console.error('Error loading board:', error);
    res.status(500).json({ error: 'Failed to load board' });
  }
});

// Create new board — requires an account; viewing stays open via
// share links and the public board list
app.post('/api/boards', requireAuth, async (req, res) => {
  try {
    const {
      name, type, xTeamName, yTeamName, xAxis, yAxis, prizes,
      squares: importedSquares, leagueId, squarePrice, liveGame
    } = req.body;

    if (!name || !type || !xTeamName || !yTeamName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!BOARD_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid board type. Use one of: ${BOARD_TYPES.join(', ')}` });
    }

    // Axes are optional for grid boards now — league boards fill squares
    // first and draw numbers later. If provided, they must be valid.
    const axesProvided = Array.isArray(xAxis) && xAxis.length > 0 && Array.isArray(yAxis) && yAxis.length > 0;
    if (type !== 'strip-10' && axesProvided) {
      if (!isValidAxisPermutation(xAxis) || !isValidAxisPermutation(yAxis)) {
        return res.status(400).json({ error: 'Each axis must contain the digits 0-9 exactly once' });
      }
    }

    // League attachment requires owning the league
    let league = null;
    if (leagueId) {
      league = await storage.getLeagueById(leagueId);
      if (!league || league.ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Only the league owner can add games to it' });
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
      } else if (req.body.drawLater) {
        // Claim-first flow: spots exist with no digits until the group
        // fills the board and the owner runs (or enters) the draw.
        for (let i = 0; i < 10; i++) {
          squares.push({ number: i + 1, xDigits: [], yDigits: [], owner: '' });
        }
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
      name: sanitizeName(name, 100),
      type,
      xTeamName: sanitizeName(xTeamName, 40),
      yTeamName: sanitizeName(yTeamName, 40),
      xAxis: type === 'strip-10' ? [] : (axesProvided ? xAxis.map(Number) : []),
      yAxis: type === 'strip-10' ? [] : (axesProvided ? yAxis.map(Number) : []),
      prizes: prizes || {},
      squares,
      currentScore: { xTeam: 0, yTeam: 0 },
      gamePhase: 'pre-game',
      periodResults: {},
      payments: {},
      squarePrice: Math.max(0, Number(squarePrice) || 0),
      shareToken: uuidv4(),
      createdAt: new Date().toISOString()
    };

    if (type !== 'strip-10' && axesProvided) {
      newBoard.drawLog = { mode: 'manual', runs: 0, drawnAt: newBoard.createdAt };
    }

    newBoard.ownerId = req.user.id;
    if (league) {
      newBoard.leagueId = league.id;
      newBoard.leagueName = league.name;
    }

    // Optional live game link at creation (from the NFL week picker)
    if (liveGame && liveGame.eventId && ['home', 'away'].includes(liveGame.xTeamSide)) {
      try {
        const game = await getGame(String(liveGame.eventId));
        newBoard.liveGame = {
          eventId: String(liveGame.eventId),
          xTeamSide: liveGame.xTeamSide,
          gameName: game.name,
          linkedAt: new Date().toISOString()
        };
        applyGameToBoard(newBoard, game);
      } catch (err) {
        console.error('Live game link at creation failed:', err.message);
        // Board still gets created; the owner can link from the board view
      }
    }

    await storage.saveBoard(newBoard);
    res.status(201).json({ ...newBoard, canEdit: true });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// Shared guard for board mutations
async function loadEditableBoard(req, res) {
  const board = await storage.getBoardById(req.params.id);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return null;
  }
  if (!canEditBoard(board, req.user)) {
    res.status(403).json({ error: 'Only the board owner can make changes' });
    return null;
  }
  return board;
}

// Draw the axis numbers: run the randomizer N times (keeping the full
// history for transparency) or enter externally-drawn numbers manually.
app.put('/api/boards/:id/draw-axes', async (req, res) => {
  try {
    const board = await loadEditableBoard(req, res);
    if (!board) return;

    if (board.gamePhase !== 'pre-game') {
      return res.status(400).json({ error: 'Numbers are locked once the game has started' });
    }

    const { runs, xAxis, yAxis, mode } = req.body;

    // Grids take the permutations as their axes; strips derive each
    // spot's digit groups from the same two rows in reading order, so
    // the drawn rows fully determine the board either way.
    const applyPermutations = (xPerm, yPerm) => {
      if (board.type === 'strip-10') {
        const blocks = strip10BlocksFromPermutations(xPerm, yPerm);
        board.squares.forEach((square, i) => {
          square.xDigits = blocks[i].xDigits;
          square.yDigits = blocks[i].yDigits;
        });
      } else {
        board.xAxis = xPerm;
        board.yAxis = yPerm;
      }
    };

    if (mode === 'manual') {
      if (!isValidAxisPermutation(xAxis) || !isValidAxisPermutation(yAxis)) {
        return res.status(400).json({ error: 'Each axis must contain the digits 0-9 exactly once' });
      }
      applyPermutations(xAxis.map(Number), yAxis.map(Number));
      board.drawLog = { mode: 'manual', runs: 0, drawnAt: new Date().toISOString() };
    } else {
      const runCount = parseInt(runs, 10);
      if (isNaN(runCount) || runCount < 1 || runCount > MAX_DRAW_RUNS) {
        return res.status(400).json({ error: `runs must be between 1 and ${MAX_DRAW_RUNS}` });
      }
      const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const history = [];
      for (let i = 0; i < runCount; i++) {
        history.push({ xAxis: shuffle(digits), yAxis: shuffle(digits) });
      }
      const final = history[history.length - 1];
      applyPermutations(final.xAxis, final.yAxis);
      board.drawLog = {
        mode: 'randomized',
        runs: runCount,
        history,
        drawnAt: new Date().toISOString()
      };
    }

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
  } catch (error) {
    console.error('Error drawing axes:', error);
    res.status(500).json({ error: 'Failed to draw numbers' });
  }
});

// Track who has paid for their squares (per owner name)
app.put('/api/boards/:id/payments', async (req, res) => {
  try {
    const board = await loadEditableBoard(req, res);
    if (!board) return;

    const name = sanitizeOwner(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    board.payments = board.payments || {};
    const key = name.toLowerCase();
    if (req.body.paid) {
      board.payments[key] = { paid: true, name, markedAt: new Date().toISOString() };
    } else {
      delete board.payments[key];
    }

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
  } catch (error) {
    console.error('Error updating payments:', error);
    res.status(500).json({ error: 'Failed to update payments' });
  }
});

// Update board squares in bulk (owners and, for strip boards, digits)
app.put('/api/boards/:id/squares', async (req, res) => {
  try {
    const { squares } = req.body;

    if (!Array.isArray(squares) || squares.length === 0) {
      return res.status(400).json({ error: 'squares must be a non-empty array' });
    }

    const board = await loadEditableBoard(req, res);
    if (!board) return;

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

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
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

    const board = await loadEditableBoard(req, res);
    if (!board) return;

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

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
  } catch (error) {
    console.error('Error updating square owner:', error);
    res.status(500).json({ error: 'Failed to update square owner' });
  }
});

// Update game score
app.put('/api/boards/:id/score', async (req, res) => {
  try {
    const { xTeam, yTeam, gamePhase } = req.body;

    const board = await loadEditableBoard(req, res);
    if (!board) return;

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
      const prevPhase = board.gamePhase;
      board.gamePhase = gamePhase;

      // Advancing the phase by hand means the submitted score is the one
      // the finished period ended on — record it so nobody has to remember
      // to hit Record at exactly the right moment.
      const completed = latestCompletedPeriod(prevPhase, gamePhase);
      if (completed && boardHasAxes(board) && !(board.periodResults || {})[completed]) {
        board.periodResults = board.periodResults || {};
        board.periodResults[completed] =
          buildPeriodResult(board, board.currentScore.xTeam, board.currentScore.yTeam, true);
      }
    }

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
  } catch (error) {
    console.error('Error updating score:', error);
    res.status(500).json({ error: 'Failed to update score' });
  }
});

// Record (or clear) the winning square for a game period
app.put('/api/boards/:id/period-result', async (req, res) => {
  try {
    const { period, clear } = req.body;

    if (!PERIODS.includes(period)) {
      return res.status(400).json({ error: `period must be one of: ${PERIODS.join(', ')}` });
    }

    const board = await loadEditableBoard(req, res);
    if (!board) return;

    board.periodResults = board.periodResults || {};

    if (clear) {
      delete board.periodResults[period];
      await storage.saveBoard(board);
      return res.json({ ...board, canEdit: true });
    }

    if (!board.currentScore || board.gamePhase === 'pre-game') {
      return res.status(400).json({ error: 'Set the score and game phase before recording a result' });
    }

    board.periodResults[period] =
      buildPeriodResult(board, board.currentScore.xTeam, board.currentScore.yTeam);

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
  } catch (error) {
    console.error('Error recording period result:', error);
    res.status(500).json({ error: 'Failed to record period result' });
  }
});

// Link (or unlink) a board to a live NFL game
app.put('/api/boards/:id/live-game', async (req, res) => {
  try {
    const { eventId, xTeamSide, clear } = req.body;

    const board = await loadEditableBoard(req, res);
    if (!board) return;

    if (clear) {
      delete board.liveGame;
      await storage.saveBoard(board);
      return res.json({ ...board, canEdit: true });
    }

    if (!eventId || !['home', 'away'].includes(xTeamSide)) {
      return res.status(400).json({ error: 'eventId and xTeamSide (home|away) are required' });
    }

    const game = await getGame(String(eventId));
    board.liveGame = {
      eventId: String(eventId),
      xTeamSide,
      gameName: game.name,
      linkedAt: new Date().toISOString()
    };
    applyGameToBoard(board, game);

    await storage.saveBoard(board);
    res.json({ ...board, canEdit: true });
  } catch (error) {
    console.error('Error linking live game:', error);
    res.status(502).json({ error: 'Failed to link live game (ESPN lookup failed)' });
  }
});

// The winning square(s) for an arbitrary score, without disturbing the
// board's live state. Winners carry the owner's name when the square is
// claimed; viewers see the square number otherwise.
function buildPeriodResult(board, xTeam, yTeam, auto = false) {
  const winners = findWinningSquares({
    ...board,
    currentScore: { xTeam, yTeam },
    gamePhase: 'in-progress'
  });
  const result = {
    winners,
    score: { xTeam, yTeam },
    recordedAt: new Date().toISOString()
  };
  if (auto) result.auto = true;
  return result;
}

// Live-linked boards record each period the moment ESPN says it's over,
// using linescores so the score is exact even when the sync lands mid-way
// through the next quarter. Existing recordings are never overwritten, so
// a commissioner's manual (re-)record always wins.
function autoRecordLivePeriods(board, game) {
  if (!boardHasAxes(board)) return;

  const xSide = board.liveGame?.xTeamSide === 'away' ? 'away' : 'home';
  const scores = completedPeriodScores(game);
  board.periodResults = board.periodResults || {};

  for (const [period, score] of Object.entries(scores)) {
    if (board.periodResults[period]) continue;
    const xTeam = xSide === 'home' ? score.home : score.away;
    const yTeam = xSide === 'home' ? score.away : score.home;
    board.periodResults[period] = buildPeriodResult(board, xTeam, yTeam, true);
  }
}

// Pull the latest live score from ESPN into the board
async function syncBoardLive(board) {
  const game = await getGame(board.liveGame.eventId);
  applyGameToBoard(board, game);
  autoRecordLivePeriods(board, game);
  await storage.saveBoard(board);
  return game;
}

app.post('/api/boards/:id/sync-live', async (req, res) => {
  try {
    const board = await loadEditableBoard(req, res);
    if (!board) return;

    if (!board.liveGame?.eventId) {
      return res.status(400).json({ error: 'Board is not linked to a live game' });
    }

    const game = await syncBoardLive(board);
    res.json({ board: { ...board, canEdit: true }, game });
  } catch (error) {
    console.error('Error syncing live score:', error);
    res.status(502).json({ error: 'Failed to sync live score' });
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

    const board = await storage.getBoardById(req.params.id);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    if (board.ownerId && (!req.user || req.user.id !== board.ownerId)) {
      return res.status(403).json({ error: 'This board is private. Ask the owner for a share link.' });
    }

    const winningCombinations = calculateWinningScores(board, userSquares);
    const currentWinners = checkCurrentWinners(board, userSquares);

    res.json({
      board,
      userSquares,
      winningCombinations,
      currentWinners,
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
    const board = await loadEditableBoard(req, res);
    if (!board) return;

    await storage.removeBoardById(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// ============================================================
// Public share endpoints (read-only board access by token)
// ============================================================

async function loadSharedBoard(req, res) {
  const board = await storage.getBoardByShareToken(req.params.token);
  if (!board) {
    res.status(404).json({ error: 'Board not found — the share link may be wrong or revoked' });
    return null;
  }
  return board;
}

app.get('/api/share/:token', async (req, res) => {
  try {
    const board = await loadSharedBoard(req, res);
    if (!board) return;
    res.json({ ...board, canEdit: false });
  } catch (error) {
    console.error('Error loading shared board:', error);
    res.status(500).json({ error: 'Failed to load board' });
  }
});

app.get('/api/share/:token/my-squares', async (req, res) => {
  try {
    const board = await loadSharedBoard(req, res);
    if (!board) return;

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

    res.json({
      board: { ...board, canEdit: false },
      userSquares,
      winningCombinations: calculateWinningScores(board, userSquares),
      currentWinners: checkCurrentWinners(board, userSquares),
      currentScore: board.currentScore
    });
  } catch (error) {
    console.error('Error getting shared winning combinations:', error);
    res.status(500).json({ error: 'Failed to get winning combinations' });
  }
});

// Viewers watching a shared board can refresh the live score — this
// only pulls fresh data from ESPN, it can't change anything else.
app.post('/api/share/:token/sync-live', async (req, res) => {
  try {
    const board = await loadSharedBoard(req, res);
    if (!board) return;

    if (!board.liveGame?.eventId) {
      return res.status(400).json({ error: 'Board is not linked to a live game' });
    }

    const game = await syncBoardLive(board);
    res.json({ board: { ...board, canEdit: false }, game });
  } catch (error) {
    console.error('Error syncing shared live score:', error);
    res.status(502).json({ error: 'Failed to sync live score' });
  }
});

// ============================================================
// LLM image import
// ============================================================

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
  if (API_KEYS.openrouter) {
    providers.push({ id: 'openrouter', name: 'OpenRouter (any model)', configured: true, defaultModel: DEFAULT_OPENROUTER_MODEL });
  }

  res.json({ providers, hasConfiguredProviders: providers.length > 0, openrouterDefaultModel: DEFAULT_OPENROUTER_MODEL });
});

app.post('/api/parse-image', async (req, res) => {
  try {
    const { image, provider, apiKey: clientApiKey, model } = req.body;

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

    const mimeMatch = image.match(/^data:(image\/[\w.+-]+);base64,/i);
    const mimeType = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/png';
    const base64Data = image.replace(/^data:image\/[\w.+-]+;base64,/i, '');

    if (!base64Data) {
      return res.status(400).json({ error: 'Image data is empty' });
    }

    // Model override is an OpenRouter feature — pick any vision model
    let modelOverride;
    if (provider === 'openrouter' && model !== undefined) {
      if (typeof model !== 'string' || !OPENROUTER_MODEL_RE.test(model)) {
        return res.status(400).json({ error: 'Invalid model id — use the OpenRouter format, e.g. google/gemini-2.5-flash-lite' });
      }
      modelOverride = model;
    }

    const result = await parseImage(base64Data, mimeType, provider, apiKey, { model: modelOverride });
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
