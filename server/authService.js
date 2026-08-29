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

function signPayload(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', getAuthSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function signToken(userId, ttlDays = TOKEN_TTL_DAYS) {
  return signPayload({
    uid: userId,
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000
  });
}

function verifyToken(token) {
  const payload = verifyPayload(token);
  // Session tokens carry no purpose — anything with one (e.g. a reset
  // token) must never be usable to sign in.
  if (!payload || !payload.uid || payload.purpose) return null;
  return { userId: payload.uid };
}

// ---------------------------------------------------------------
// Password reset tokens: signed, 30-minute expiry, and bound to a
// fingerprint of the CURRENT password hash — changing the password
// (by reset or otherwise) invalidates every outstanding token, which
// makes them effectively single-use with no extra storage.
// ---------------------------------------------------------------
function passwordVersion(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash)).digest('hex').slice(0, 12);
}

function signResetToken(userId, passwordHash, ttlMinutes = 30) {
  return signPayload({
    uid: userId,
    purpose: 'pwreset',
    pwv: passwordVersion(passwordHash),
    exp: Date.now() + ttlMinutes * 60 * 1000
  });
}

function verifyResetToken(token) {
  const payload = verifyPayload(token);
  if (!payload || payload.purpose !== 'pwreset' || !payload.uid || !payload.pwv) return null;
  return { userId: payload.uid, pwv: payload.pwv };
}

// ---------------------------------------------------------------
// Unsubscribe tokens: long-lived (links in old emails must keep
// working), purpose-bound so they can never act as a session.
// ---------------------------------------------------------------
const UNSUB_TTL_MS = 5 * 365 * 24 * 60 * 60 * 1000;

function signUnsubscribeToken(userId) {
  return signPayload({
    uid: userId,
    purpose: 'unsub',
    exp: Date.now() + UNSUB_TTL_MS
  });
}

function verifyUnsubscribeToken(token) {
  const payload = verifyPayload(token);
  if (!payload || payload.purpose !== 'unsub' || !payload.uid) return null;
  return { userId: payload.uid };
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
  signResetToken,
  verifyResetToken,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  passwordVersion,
  normalizeEmail,
  isValidEmail,
  publicUser
};
