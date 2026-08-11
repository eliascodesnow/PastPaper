const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function cuid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,10); }

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      regNumber TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      course TEXT NOT NULL,
      isAdmin BOOLEAN NOT NULL DEFAULT false,
      createdAt TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      unitCode TEXT,
      unitName TEXT,
      course TEXT NOT NULL,
      examType TEXT NOT NULL,
      year INTEGER NOT NULL,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileType TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      rejectionReason TEXT,
      screeningReport TEXT,
      downloadCount INTEGER NOT NULL DEFAULT 0,
      uploaderId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// Initialize tables in background
init().catch(err => {
  console.error('Failed to initialize Postgres schema:', err);
});

async function createUser({ regNumber, name, passwordHash, course, isAdmin = false }) {
  const id = cuid();
  await pool.query(
    `INSERT INTO users(id, regNumber, name, passwordHash, course, isAdmin) VALUES($1,$2,$3,$4,$5,$6)`,
    [id, regNumber, name, passwordHash, course, isAdmin]
  );
  return getUserById(id);
}

async function getUserByRegNumber(regNumber) {
  const r = await pool.query(`SELECT * FROM users WHERE regNumber = $1 LIMIT 1`, [regNumber]);
  return r.rows[0] || null;
}
async function getUserById(id) {
  const r = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0] || null;
}

async function createPaper(paper) {
  const id = cuid();
  const q = `INSERT INTO papers
    (id, title, unitCode, unitName, course, examType, year, fileName, filePath, fileType, status, rejectionReason, screeningReport, uploaderId)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
  await pool.query(q, [
    id,
    paper.title,
    paper.unitCode || null,
    paper.unitName || null,
    paper.course,
    paper.examType,
    paper.year,
    paper.fileName,
    paper.filePath,
    paper.fileType,
    paper.status || 'PENDING',
    paper.rejectionReason || null,
    paper.screeningReport || null,
    paper.uploaderId,
  ]);
  return getPaperById(id);
}

async function getPaperById(id) {
  const r = await pool.query(`SELECT * FROM papers WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0] || null;
}

async function listApprovedPapers({ course, unitCode, year, examType, q } = {}) {
  let sql = `SELECT papers.*, users.name AS "uploaderName" FROM papers JOIN users ON users.id = papers.uploaderId WHERE papers.status = 'APPROVED'`;
  const params = [];
  let idx = 1;
  if (course) { sql += ` AND papers.course = $${idx++}`; params.push(course); }
  if (unitCode) { sql += ` AND papers.unitCode = $${idx++}`; params.push(unitCode); }
  if (year) { sql += ` AND papers.year = $${idx++}`; params.push(year); }
  if (examType) { sql += ` AND papers.examType = $${idx++}`; params.push(examType); }
  if (q) { sql += ` AND (papers.title ILIKE $${idx} OR papers.unitName ILIKE $${idx} OR papers.unitCode ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
  sql += ` ORDER BY papers.createdAt DESC`;
  const r = await pool.query(sql, params);
  return r.rows;
}

async function listPapersByUploader(uploaderId) {
  const r = await pool.query(`SELECT * FROM papers WHERE uploaderId = $1 ORDER BY createdAt DESC`, [uploaderId]);
  return r.rows;
}

async function incrementDownloadCount(id) {
  await pool.query(`UPDATE papers SET downloadCount = downloadCount + 1 WHERE id = $1`, [id]);
}

async function setPaperStatus(id, status) {
  await pool.query(`UPDATE papers SET status = $1 WHERE id = $2`, [status, id]);
  return getPaperById(id);
}

module.exports = {
  createUser,
  getUserByRegNumber,
  getUserById,
  createPaper,
  getPaperById,
  listApprovedPapers,
  listPapersByUploader,
  incrementDownloadCount,
  setPaperStatus,
  pool,
};
