const test = require('node:test');
const assert = require('node:assert');
const {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  signResetToken,
  verifyResetToken,
  passwordVersion,
  normalizeEmail,
  isValidEmail,
  isAdminEmail,
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

test('reset tokens round-trip and carry the password fingerprint', () => {
  const hash = hashPassword('original-password');
  const token = signResetToken('user-9', hash);
  const payload = verifyResetToken(token);
  assert.strictEqual(payload.userId, 'user-9');
  assert.strictEqual(payload.pwv, passwordVersion(hash));
});

test('reset tokens cannot be used as session tokens (and vice versa)', () => {
  const resetToken = signResetToken('user-9', hashPassword('pw12345678'));
  assert.strictEqual(verifyToken(resetToken), null, 'reset token must not sign a user in');

  const sessionToken = signToken('user-9');
  assert.strictEqual(verifyResetToken(sessionToken), null, 'session token must not reset a password');
});

test('changing the password invalidates outstanding reset tokens', () => {
  const oldHash = hashPassword('old-password-1');
  const token = signResetToken('user-9', oldHash);
  const payload = verifyResetToken(token);

  const newHash = hashPassword('new-password-2');
  // The route compares the token pwv with the CURRENT hash's version
  assert.notStrictEqual(payload.pwv, passwordVersion(newHash));
  assert.strictEqual(payload.pwv, passwordVersion(oldHash));
});

test('expired reset tokens are rejected', () => {
  const token = signResetToken('user-9', hashPassword('pw12345678'), -1);
  assert.strictEqual(verifyResetToken(token), null);
});

test('email helpers', () => {
  assert.strictEqual(normalizeEmail('  Chad@Example.COM '), 'chad@example.com');
  assert.ok(isValidEmail('chad@example.com'));
  assert.ok(!isValidEmail('not-an-email'));
  assert.ok(!isValidEmail('a@b'));
  assert.ok(!isValidEmail(''));
});

test('isAdminEmail matches the ADMIN_EMAILS allowlist', () => {
  const original = process.env.ADMIN_EMAILS;
  try {
    delete process.env.ADMIN_EMAILS;
    assert.ok(!isAdminEmail('chad@example.com'), 'unset list means no admins');

    process.env.ADMIN_EMAILS = ' Chad@Example.com , other@site.io ';
    assert.ok(isAdminEmail('chad@example.com'));
    assert.ok(isAdminEmail('  CHAD@example.COM '), 'comparison is normalized');
    assert.ok(isAdminEmail('other@site.io'));
    assert.ok(!isAdminEmail('viewer@example.com'));
    assert.ok(!isAdminEmail(''));

    process.env.ADMIN_EMAILS = '   ';
    assert.ok(!isAdminEmail('chad@example.com'), 'blank list means no admins');
  } finally {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  }
});

test('publicUser strips the password hash', () => {
  const user = { id: '1', email: 'a@b.co', name: 'A', passwordHash: 'scrypt:x:y', trackedGames: [] };
  const pub = publicUser(user);
  assert.strictEqual(pub.passwordHash, undefined);
  assert.strictEqual(pub.email, 'a@b.co');
  assert.strictEqual(publicUser(null), null);
});
