const test = require('node:test');
const assert = require('node:assert');
const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  normalizeEmail,
  isValidEmail,
  publicUser
} = require('./authService');

test('password hashing verifies the right password and rejects others', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.ok(stored.startsWith('scrypt:'));
  assert.ok(verifyPassword('correct horse battery staple', stored));
  assert.ok(!verifyPassword('wrong password', stored));
  assert.ok(!verifyPassword('', stored));
  assert.ok(!verifyPassword('x', 'garbage'));
  assert.ok(!verifyPassword('x', null));
});

test('same password hashes differently each time (random salt)', () => {
  assert.notStrictEqual(hashPassword('secret123'), hashPassword('secret123'));
});

test('tokens round-trip and carry the user id', () => {
  const token = signToken('user-123');
  const payload = verifyToken(token);
  assert.strictEqual(payload.userId, 'user-123');
});

test('tampered and malformed tokens are rejected', () => {
  const token = signToken('user-123');
  const [body, sig] = token.split('.');

  // Tampered payload
  const forgedBody = Buffer.from(JSON.stringify({ uid: 'someone-else', exp: Date.now() + 9999999 })).toString('base64url');
  assert.strictEqual(verifyToken(`${forgedBody}.${sig}`), null);

  // Tampered signature
  assert.strictEqual(verifyToken(`${body}.AAAA${sig.slice(4)}`), null);

  // Garbage
  assert.strictEqual(verifyToken('not-a-token'), null);
  assert.strictEqual(verifyToken(''), null);
  assert.strictEqual(verifyToken(null), null);
});

test('expired tokens are rejected', () => {
  const token = signToken('user-123', -1); // expired a day ago
  assert.strictEqual(verifyToken(token), null);
});

test('email helpers', () => {
  assert.strictEqual(normalizeEmail('  Chad@Example.COM '), 'chad@example.com');
  assert.ok(isValidEmail('chad@example.com'));
  assert.ok(!isValidEmail('not-an-email'));
  assert.ok(!isValidEmail('a@b'));
  assert.ok(!isValidEmail(''));
});

test('publicUser strips the password hash', () => {
  const user = { id: '1', email: 'a@b.co', name: 'A', passwordHash: 'scrypt:x:y', trackedGames: [] };
  const pub = publicUser(user);
  assert.strictEqual(pub.passwordHash, undefined);
  assert.strictEqual(pub.email, 'a@b.co');
  assert.strictEqual(publicUser(null), null);
});
