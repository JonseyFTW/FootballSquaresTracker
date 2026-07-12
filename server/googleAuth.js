// "Sign in with Google" — server-side verification of Google Identity
// Services ID tokens, with zero dependencies. The client gets a signed
// JWT (the "credential") from Google's button; we verify its RS256
// signature against Google's published JWKS and check the claims.

const crypto = require('crypto');

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;

let keyCache = { keys: null, fetchedAt: 0 };

async function fetchGoogleKeys() {
  if (keyCache.keys && Date.now() - keyCache.fetchedAt < KEY_CACHE_TTL_MS) {
    return keyCache.keys;
  }
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google signing keys: HTTP ${response.status}`);
  }
  const { keys } = await response.json();
  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function b64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Verifies a Google ID token and returns its identity claims.
// `options.getKey(kid)` can inject a key lookup for tests; production
// uses Google's JWKS endpoint with an in-process cache.
async function verifyGoogleIdToken(credential, options = {}) {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const parts = String(credential || '').split('.');
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch (err) {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  // Resolve the public key for this token's key id
  let jwk;
  if (options.getKey) {
    jwk = await options.getKey(header.kid);
  } else {
    const keys = await fetchGoogleKeys();
    jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) {
      // Key rotation between cache refreshes — refetch once
      keyCache = { keys: null, fetchedAt: 0 };
      const fresh = await fetchGoogleKeys();
      jwk = fresh.find(k => k.kid === header.kid);
    }
  }
  if (!jwk) return null;

  // Signature check
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const signed = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], 'base64url');
    const valid = crypto.verify('RSA-SHA256', Buffer.from(signed), publicKey, signature);
    if (!valid) return null;
  } catch (err) {
    return null;
  }

  // Claim checks
  if (!VALID_ISSUERS.includes(payload.iss)) return null;
  if (payload.aud !== clientId) return null;
  if (!payload.exp || Date.now() >= payload.exp * 1000) return null;
  if (!payload.email || payload.email_verified !== true) return null;

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.given_name || payload.email.split('@')[0]
  };
}

module.exports = { verifyGoogleIdToken };
