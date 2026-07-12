// Accounts + stateless auth with zero new dependencies.
// Passwords: node:crypto scrypt. Sessions: HMAC-SHA256 signed bearer
// tokens (JWT-shaped) so they work across serverless instances.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const TOKEN_TTL_DAYS = 30;
const SCRYPT_KEYLEN = 64;

// ---------------------------------------------------------------
// Secret resolution. Priority:
//   1. AUTH_SECRET env var (recommended — rotating it logs everyone out)
//   2. Derived from POSTGRES_URL (stable across serverless instances,
//      secret because the connection string contains the DB password)
//   3. Local dev: random secret persisted next to the data files
// ---------------------------------------------------------------
let cachedSecret = null;

function getAuthSecret() {
  if (cachedSecret) return cachedSecret;

  if (process.env.AUTH_SECRET) {
    cachedSecret = process.env.AUTH_SECRET;
    return cachedSecret;
  }

  if (process.env.POSTGRES_URL) {
    cachedSecret = crypto.createHash('sha256')
      .update(`fst-auth-secret:${process.env.POSTGRES_URL}`)
      .digest('hex');
    return cachedSecret;
  }

  // Local file-based fallback (dev / Docker volume)
  const secretFile = path.join(__dirname, 'data', 'auth-secret');
  try {
    cachedSecret = fs.readFileSync(secretFile, 'utf8').trim();
    if (cachedSecret) return cachedSecret;
  } catch (err) { /* first run */ }

  cachedSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, cachedSecret, { mode: 0o600 });
  } catch (err) {
    console.warn('Could not persist auth secret; sessions will reset on restart');
  }
  return cachedSecret;
}

// ---------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, salt, expected] = String(stored).split(':');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN);
    const expectedBuf = Buffer.from(expected, 'hex');
    return derived.length === expectedBuf.length && crypto.timingSafeEqual(derived, expectedBuf);
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------
// Tokens: base64url(payload).base64url(hmac)
// ---------------------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function signToken(userId, ttlDays = TOKEN_TTL_DAYS) {
  const payload = JSON.stringify({
    uid: userId,
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000
  });
  const body = b64url(payload);
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.uid || !payload.exp || Date.now() > payload.exp) return null;
    return { userId: payload.uid };
  } catch (err) {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Strip fields that must never leave the server
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = {
  getAuthSecret,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  normalizeEmail,
  isValidEmail,
  publicUser
};
