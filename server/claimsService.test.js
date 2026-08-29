const test = require('node:test');
const assert = require('node:assert');
const {
  claimMode,
  joinMode,
  memberStatus,
  sanitizePaymentMethods,
  pendingForSquare,
  userPendingCount,
  publicRequestView,
  amountOwed,
  requestableSquares,
  waitlistOpen,
  requestBlocker
} = require('./claimsService');

const board = (over = {}) => ({
  claimMode: 'approval',
  gamePhase: 'pre-game',
  squarePrice: 58,
  squares: [
    { number: 1, owner: 'Darcey', ownerUserId: 'u-darcey' },
    { number: 2, owner: '' },
    { number: 3, owner: '' }
  ],
  requests: [],
  waitlist: [],
  ...over
});

test('claimMode and joinMode default legacy records safely', () => {
  assert.strictEqual(claimMode({}), 'admin');
  assert.strictEqual(claimMode({ claimMode: 'auto' }), 'auto');
  assert.strictEqual(claimMode({ claimMode: 'bogus' }), 'admin');
  assert.strictEqual(joinMode({}), 'approval');
  assert.strictEqual(joinMode({ joinMode: 'auto' }), 'auto');
});

test('memberStatus reads the joined roster', () => {
  const league = { joinedMembers: [
    { userId: 'a', status: 'active' },
    { userId: 'b', status: 'pending' },
    { userId: 'c', status: 'banned' }
  ] };
  assert.strictEqual(memberStatus(league, 'a'), 'active');
  assert.strictEqual(memberStatus(league, 'b'), 'pending');
  assert.strictEqual(memberStatus(league, 'c'), 'banned');
  assert.strictEqual(memberStatus(league, 'nobody'), null);
  assert.strictEqual(memberStatus({}, 'a'), null);
});

test('sanitizePaymentMethods validates types and handles', () => {
  assert.deepStrictEqual(
    sanitizePaymentMethods([{ type: 'venmo', handle: ' @glenn-schott-1 ' }]),
    [{ type: 'venmo', handle: '@glenn-schott-1' }]
  );
  assert.strictEqual(sanitizePaymentMethods([{ type: 'bitcoin', handle: 'x' }]), null);
  assert.strictEqual(sanitizePaymentMethods([{ type: 'zelle', handle: '   ' }]), null);
  assert.strictEqual(sanitizePaymentMethods('nope'), null);
  const six = Array.from({ length: 6 }, () => ({ type: 'venmo', handle: 'h' }));
  assert.strictEqual(sanitizePaymentMethods(six).length, 5);
});

test('requestBlocker walks the failure cases in order', () => {
  assert.match(requestBlocker(board({ claimMode: 'admin' }), 2).error, /commissioner assigns/);
  assert.match(requestBlocker(board({ gamePhase: '2nd Quarter' }), 2).error, /locked/);
  assert.match(requestBlocker(board(), 99).error, /does not exist/);
  assert.match(requestBlocker(board(), 1).error, /already taken/);
  const withPending = board({ requests: [{ squareNumber: 2, userId: 'x', status: 'pending' }] });
  assert.match(requestBlocker(withPending, 2).error, /already requested/);
  assert.strictEqual(requestBlocker(board(), 2), null);
});

test('publicRequestView exposes holds, never identities', () => {
  const b = board({ requests: [
    { squareNumber: 2, userId: 'u1', userName: 'Secret Name', status: 'pending' },
    { squareNumber: 3, userId: 'u2', userName: 'Other', status: 'denied' }
  ] });
  const view = publicRequestView(b, 'u1');
  assert.deepStrictEqual(view, [{ squareNumber: 2, mine: true }]);
  assert.ok(!JSON.stringify(view).includes('Secret'));
  assert.deepStrictEqual(publicRequestView(b, 'stranger'), [{ squareNumber: 2, mine: false }]);
});

test('requestableSquares and waitlistOpen track what is left', () => {
  assert.deepStrictEqual(requestableSquares(board()), [2, 3]);
  const oneHeld = board({ requests: [{ squareNumber: 2, userId: 'x', status: 'pending' }] });
  assert.deepStrictEqual(requestableSquares(oneHeld), [3]);
  assert.strictEqual(waitlistOpen(oneHeld), false);
  const allHeld = board({ requests: [
    { squareNumber: 2, userId: 'x', status: 'pending' },
    { squareNumber: 3, userId: 'y', status: 'pending' }
  ] });
  assert.strictEqual(waitlistOpen(allHeld), true);
  assert.strictEqual(waitlistOpen(board({ claimMode: 'admin' })), false);
});

test('amountOwed and pending counts follow the linked account', () => {
  assert.strictEqual(amountOwed(board(), 'u-darcey'), 58);
  assert.strictEqual(amountOwed(board(), 'nobody'), 0);
  const b = board({ requests: [
    { squareNumber: 2, userId: 'u1', status: 'pending' },
    { squareNumber: 3, userId: 'u1', status: 'pending' },
    { squareNumber: 3, userId: 'u1', status: 'denied' }
  ] });
  assert.strictEqual(userPendingCount(b, 'u1'), 2);
  assert.strictEqual(pendingForSquare(b, 2).userId, 'u1');
});
