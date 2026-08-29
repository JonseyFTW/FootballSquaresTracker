// Unified storage for boards, users, and leagues.
// Backends: Postgres (POSTGRES_URL set), in-memory (Vercel without
// Postgres — non-persistent), or JSON files (local dev / Docker).

const path = require('path');
const fs = require('fs');

const usePostgres = !!process.env.POSTGRES_URL;
const useInMemory = !usePostgres && !!process.env.VERCEL;

let db;
if (usePostgres) {
  db = require('./db');
}

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  boards: path.join(DATA_DIR, 'boards.json'),
  users: path.join(DATA_DIR, 'users.json'),
  leagues: path.join(DATA_DIR, 'leagues.json')
};

const memory = { boards: [], users: [], leagues: [] };

if (!usePostgres && !useInMemory) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readCollection(name) {
  if (useInMemory) return memory[name];
  try {
    const raw = JSON.parse(fs.readFileSync(FILES[name], 'utf8'));
    return raw[name] || [];
  } catch (err) {
    return [];
  }
}

function writeCollection(name, items) {
  if (useInMemory) {
    memory[name] = items;
    return;
  }
  fs.writeFileSync(FILES[name], JSON.stringify({ [name]: items }, null, 2));
}

function upsert(name, item) {
  const items = readCollection(name);
  const idx = items.findIndex(x => x.id === item.id);
  if (idx === -1) items.push(item);
  else items[idx] = item;
  writeCollection(name, items);
}

function removeById(name, id) {
  const items = readCollection(name);
  const idx = items.findIndex(x => x.id === id);
  if (idx !== -1) {
    items.splice(idx, 1);
    writeCollection(name, items);
  }
}

// ----- Boards -----

async function getAllBoards() {
  if (usePostgres) return (await db.loadBoards()).boards;
  return readCollection('boards');
}

async function getBoardById(id) {
  if (usePostgres) return db.getBoard(id);
  return readCollection('boards').find(b => b.id === id) || null;
}

async function getBoardByShareToken(token) {
  if (!token) return null;
  if (usePostgres) return db.getBoardByShareToken(token);
  return readCollection('boards').find(b => b.shareToken === token) || null;
}

async function getBoardsByLeagueId(leagueId) {
  if (usePostgres) return db.getBoardsByLeagueId(leagueId);
  return readCollection('boards').filter(b => b.leagueId === leagueId);
}

async function saveBoard(board) {
  if (usePostgres) return db.saveBoard(board);
  upsert('boards', board);
}

async function removeBoardById(id) {
  if (usePostgres) return db.deleteBoard(id);
  removeById('boards', id);
}

// ----- Users -----

async function getUserById(id) {
  if (!id) return null;
  if (usePostgres) return db.getUser(id);
  return readCollection('users').find(u => u.id === id) || null;
}

async function getUserByEmail(email) {
  if (!email) return null;
  if (usePostgres) return db.getUserByEmail(email);
  return readCollection('users').find(u => u.email === email) || null;
}

async function saveUser(user) {
  if (usePostgres) return db.saveUser(user);
  upsert('users', user);
}

async function getAllUsers() {
  if (usePostgres) return db.getAllUsers();
  return readCollection('users');
}

// ----- Leagues -----

async function getLeagueById(id) {
  if (!id) return null;
  if (usePostgres) return db.getLeague(id);
  return readCollection('leagues').find(l => l.id === id) || null;
}

async function getLeagueByShareToken(token) {
  if (!token) return null;
  if (usePostgres) return db.getLeagueByShareToken(token);
  return readCollection('leagues').find(l => l.shareToken === token) || null;
}

async function getLeaguesByOwnerId(ownerId) {
  if (usePostgres) return db.getLeaguesByOwnerId(ownerId);
  return readCollection('leagues').filter(l => l.ownerId === ownerId);
}

async function saveLeague(league) {
  if (usePostgres) return db.saveLeague(league);
  upsert('leagues', league);
}

async function removeLeagueById(id) {
  if (usePostgres) return db.deleteLeague(id);
  removeById('leagues', id);
}

module.exports = {
  usePostgres,
  useInMemory,
  getAllBoards,
  getBoardById,
  getBoardByShareToken,
  getBoardsByLeagueId,
  saveBoard,
  removeBoardById,
  getUserById,
  getUserByEmail,
  getAllUsers,
  saveUser,
  getLeagueById,
  getLeagueByShareToken,
  getLeaguesByOwnerId,
  saveLeague,
  removeLeagueById
};
