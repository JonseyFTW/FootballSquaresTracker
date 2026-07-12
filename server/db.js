const { sql } = require('@vercel/postgres');

// Initialize tables if they don't exist
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

let dbInitialized = false;

async function ensureDB() {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
}

// ----- Boards -----

async function loadBoards() {
  await ensureDB();
  const result = await sql`SELECT data FROM boards ORDER BY created_at DESC`;
  return { boards: result.rows.map(r => r.data) };
}

async function saveBoard(board) {
  await ensureDB();
  await sql`
    INSERT INTO boards (id, data)
    VALUES (${board.id}, ${JSON.stringify(board)})
    ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(board)}
  `;
}

async function deleteBoard(id) {
  await ensureDB();
  await sql`DELETE FROM boards WHERE id = ${id}`;
}

async function getBoard(id) {
  await ensureDB();
  const result = await sql`SELECT data FROM boards WHERE id = ${id}`;
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function getBoardByShareToken(token) {
  await ensureDB();
  const result = await sql`SELECT data FROM boards WHERE data->>'shareToken' = ${token} LIMIT 1`;
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function getBoardsByLeagueId(leagueId) {
  await ensureDB();
  const result = await sql`
    SELECT data FROM boards WHERE data->>'leagueId' = ${leagueId} ORDER BY created_at DESC
  `;
  return result.rows.map(r => r.data);
}

// ----- Users -----

async function getUser(id) {
  await ensureDB();
  const result = await sql`SELECT data FROM users WHERE id = ${id}`;
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function getUserByEmail(email) {
  await ensureDB();
  const result = await sql`SELECT data FROM users WHERE email = ${email}`;
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function saveUser(user) {
  await ensureDB();
  await sql`
    INSERT INTO users (id, email, data)
    VALUES (${user.id}, ${user.email}, ${JSON.stringify(user)})
    ON CONFLICT (id) DO UPDATE SET email = ${user.email}, data = ${JSON.stringify(user)}
  `;
}

// ----- Leagues -----

async function getLeague(id) {
  await ensureDB();
  const result = await sql`SELECT data FROM leagues WHERE id = ${id}`;
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function getLeagueByShareToken(token) {
  await ensureDB();
  const result = await sql`SELECT data FROM leagues WHERE data->>'shareToken' = ${token} LIMIT 1`;
  if (result.rows.length === 0) return null;
  return result.rows[0].data;
}

async function getLeaguesByOwnerId(ownerId) {
  await ensureDB();
  const result = await sql`
    SELECT data FROM leagues WHERE data->>'ownerId' = ${ownerId} ORDER BY created_at DESC
  `;
  return result.rows.map(r => r.data);
}

async function saveLeague(league) {
  await ensureDB();
  await sql`
    INSERT INTO leagues (id, data)
    VALUES (${league.id}, ${JSON.stringify(league)})
    ON CONFLICT (id) DO UPDATE SET data = ${JSON.stringify(league)}
  `;
}

async function deleteLeague(id) {
  await ensureDB();
  await sql`DELETE FROM leagues WHERE id = ${id}`;
}

module.exports = {
  initDB,
  loadBoards,
  saveBoard,
  deleteBoard,
  getBoard,
  getBoardByShareToken,
  getBoardsByLeagueId,
  getUser,
  getUserByEmail,
  saveUser,
  getLeague,
  getLeagueByShareToken,
  getLeaguesByOwnerId,
  saveLeague,
  deleteLeague
};
