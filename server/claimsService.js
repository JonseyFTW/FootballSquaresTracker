// Pure logic for league membership and the square request/approval flow.
// No storage or HTTP — index.js routes orchestrate, this decides.

const CLAIM_MODES = ['auto', 'approval', 'admin'];
const JOIN_MODES = ['auto', 'approval'];
const PAYMENT_TYPES = ['venmo', 'paypal', 'zelle', 'cashapp', 'other'];
const MAX_PENDING_PER_USER = 10;
const MAX_PAYMENT_METHODS = 5;

// Legacy boards predate claim modes: the commissioner assigns everything.
function claimMode(board) {
  return CLAIM_MODES.includes(board.claimMode) ? board.claimMode : 'admin';
}

function joinMode(league) {
  return JOIN_MODES.includes(league.joinMode) ? league.joinMode : 'approval';
}

function findMember(league, userId) {
  if (!userId) return null;
  return (league.joinedMembers || []).find(m => m.userId === userId) || null;
}

// null (not a member) | 'pending' | 'active' | 'banned'
function memberStatus(league, userId) {
  return findMember(league, userId)?.status || null;
}

function sanitizePaymentMethods(input) {
  if (!Array.isArray(input)) return null;
  const clean = [];
  for (const method of input.slice(0, MAX_PAYMENT_METHODS)) {
    const type = PAYMENT_TYPES.includes(method?.type) ? method.type : null;
    const handle = String(method?.handle || '').trim().slice(0, 120);
    if (!type || !handle) return null;
    clean.push({ type, handle });
  }
  return clean;
}

function pendingRequests(board) {
  return (board.requests || []).filter(r => r.status === 'pending');
}

function pendingForSquare(board, squareNumber) {
  return pendingRequests(board).find(r => r.squareNumber === squareNumber) || null;
}

function userPendingCount(board, userId) {
  return pendingRequests(board).filter(r => r.userId === userId).length;
}

// What a viewer may know about requests: which squares are spoken for,
// and which of those are theirs. Never other people's names.
function publicRequestView(board, userId) {
  return pendingRequests(board).map(r => ({
    squareNumber: r.squareNumber,
    mine: !!userId && r.userId === userId
  }));
}

function squareByNumber(board, squareNumber) {
  return (board.squares || []).find(sq => sq.number === squareNumber) || null;
}

function ownedSquareNumbers(board, userId) {
  if (!userId) return [];
  return (board.squares || []).filter(sq => sq.ownerUserId === userId).map(sq => sq.number);
}

function amountOwed(board, userId) {
  const price = Number(board.squarePrice) || 0;
  return ownedSquareNumbers(board, userId).length * price;
}

// A board takes requests while it's pre-game, in a request mode, with at
// least one empty square nobody has a pending hold on.
function requestableSquares(board) {
  if (claimMode(board) === 'admin' || board.gamePhase !== 'pre-game') return [];
  const held = new Set(pendingRequests(board).map(r => r.squareNumber));
  return (board.squares || [])
    .filter(sq => !sq.owner && !held.has(sq.number))
    .map(sq => sq.number);
}

// The waitlist opens once there's nothing left to request directly.
function waitlistOpen(board) {
  return claimMode(board) !== 'admin' &&
    board.gamePhase === 'pre-game' &&
    requestableSquares(board).length === 0;
}

// Why a request for this square can't happen right now, or null when it can.
// League/membership checks live in the route (they need the league loaded).
function requestBlocker(board, squareNumber) {
  if (claimMode(board) === 'admin') {
    return { status: 400, error: 'The commissioner assigns squares on this board — ask them directly.' };
  }
  if (board.gamePhase !== 'pre-game') {
    return { status: 400, error: 'Squares are locked once the game starts.' };
  }
  const square = squareByNumber(board, squareNumber);
  if (!square) {
    return { status: 400, error: 'That square number does not exist on this board.' };
  }
  if (square.owner) {
    return { status: 409, error: 'That square is already taken — pick another.' };
  }
  if (pendingForSquare(board, squareNumber)) {
    return { status: 409, error: 'Someone already requested that square — pick another.' };
  }
  return null;
}

module.exports = {
  CLAIM_MODES,
  JOIN_MODES,
  MAX_PENDING_PER_USER,
  claimMode,
  joinMode,
  findMember,
  memberStatus,
  sanitizePaymentMethods,
  pendingRequests,
  pendingForSquare,
  userPendingCount,
  publicRequestView,
  squareByNumber,
  ownedSquareNumbers,
  amountOwed,
  requestableSquares,
  waitlistOpen,
  requestBlocker
};
