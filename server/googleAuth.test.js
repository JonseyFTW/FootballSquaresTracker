const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifyGoogleIdToken } = require('./googleAuth');

// Real RS256 keypair so we exercise the actual signature path
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const getKey = async (kid) => (kid === 'test-key' ? jwk : null);

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

function makeToken(claims = {}, headerOverrides = {}) {
  const header = { alg: 'RS256', kid: 'test-key', typ: 'JWT', ...headerOverrides };
  const payload = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-user-123',
    email: 'fan@gmail.com',
    email_verified: true,
    name: 'Foot Ball Fan',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims
  };
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}

const opts = { getKey, clientId: CLIENT_ID };

test('a valid Google ID token verifies and returns identity claims', async () => {
  const identity = await verifyGoogleIdToken(makeToken(), opts);
  assert.strictEqual(identity.googleId, 'google-user-123');
  assert.strictEqual(identity.email, 'fan@gmail.com');
  assert.strictEqual(identity.name, 'Foot Ball Fan');
});

test('wrong audience is rejected', async () => {
  assert.strictEqual(await verifyGoogleIdToken(makeToken({ aud: 'someone-elses-app' }), opts), null);
});

test('wrong issuer is rejected', async () => {
  assert.strictEqual(await verifyGoogleIdToken(makeToken({ iss: 'https://evil.example.com' }), opts), null);
});

test('expired token is rejected', async () => {
  assert.strictEqual(await verifyGoogleIdToken(makeToken({ exp: Math.floor(Date.now() / 1000) - 10 }), opts), null);
});

test('unverified email is rejected', async () => {
  assert.strictEqual(await verifyGoogleIdToken(makeToken({ email_verified: false }), opts), null);
});

test('tampered payload fails the signature check', async () => {
  const token = makeToken();
  const [h, , s] = token.split('.');
  const forged = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'attacker',
    email: 'attacker@gmail.com', email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  assert.strictEqual(await verifyGoogleIdToken(`${h}.${forged}.${s}`, opts), null);
});

test('unknown key id and non-RS256 algs are rejected', async () => {
  assert.strictEqual(await verifyGoogleIdToken(makeToken({}, { kid: 'unknown-key' }), opts), null);
  assert.strictEqual(await verifyGoogleIdToken(makeToken({}, { alg: 'HS256' }), opts), null);
});

test('garbage input is rejected without throwing', async () => {
  assert.strictEqual(await verifyGoogleIdToken('not-a-jwt', opts), null);
  assert.strictEqual(await verifyGoogleIdToken('', opts), null);
  assert.strictEqual(await verifyGoogleIdToken(null, opts), null);
  assert.strictEqual(await verifyGoogleIdToken('a.b.c', opts), null);
});

test('falls back to the email local part when no name claim', async () => {
  const identity = await verifyGoogleIdToken(makeToken({ name: undefined, given_name: undefined }), opts);
  assert.strictEqual(identity.name, 'fan');
});
