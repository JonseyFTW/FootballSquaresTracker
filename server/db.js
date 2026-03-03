const { sql } = require('@vercel/postgres');

// Initialize the boards table if it doesn't exist
async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS boards (
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

module.exports = { loadBoards, saveBoard, deleteBoard, getBoard, initDB };
