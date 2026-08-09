const path = require("path");
const Database = require("better-sqlite3");

// Use a dedicated env var for the SQLite file path. DATABASE_URL is
// conventionally used for Postgres-style connection strings and is
// misleading when pointing at a SQLite file.
const DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, "dev.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    regNumber TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    course TEXT NOT NULL,
    isAdmin INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
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
    uploaderId TEXT NOT NULL REFERENCES users(id),
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Postgres/Prisma migration note: this file is the only place that talks
// to the database. Swapping to Prisma+Postgres later means writing a
// schema.prisma with the same two models and re-pointing the handful of
// functions below at prisma.* calls — routes/auth.js and routes/papers.js
// don't need to change.

function cuid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const createUserStmt = db.prepare(
  `INSERT INTO users (id, regNumber, name, passwordHash, course, isAdmin) VALUES (?, ?, ?, ?, ?, ?)`
);
function createUser({ regNumber, name, passwordHash, course, isAdmin = false }) {
  const id = cuid();
  createUserStmt.run(id, regNumber, name, passwordHash, course, isAdmin ? 1 : 0);
  return getUserById(id);
}
function getUserByRegNumber(regNumber) {
  return db.prepare(`SELECT * FROM users WHERE regNumber = ?`).get(regNumber);
}
function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

const createPaperStmt = db.prepare(`
  INSERT INTO papers
    (id, title, unitCode, unitName, course, examType, year, fileName, filePath, fileType, status, rejectionReason, screeningReport, uploaderId)
  VALUES (@id, @title, @unitCode, @unitName, @course, @examType, @year, @fileName, @filePath, @fileType, @status, @rejectionReason, @screeningReport, @uploaderId)
`);
function createPaper(paper) {
  const id = cuid();
  createPaperStmt.run({ id, ...paper });
  return getPaperById(id);
}
function getPaperById(id) {
  return db.prepare(`SELECT * FROM papers WHERE id = ?`).get(id);
}
function listApprovedPapers({ course, unitCode, year, examType, q } = {}) {
  let sql = `SELECT papers.*, users.name AS uploaderName FROM papers JOIN users ON users.id = papers.uploaderId WHERE papers.status = 'APPROVED'`;
  const params = [];
  if (course) { sql += ` AND papers.course = ?`; params.push(course); }
  if (unitCode) { sql += ` AND papers.unitCode = ?`; params.push(unitCode); }
  if (year) { sql += ` AND papers.year = ?`; params.push(year); }
  if (examType) { sql += ` AND papers.examType = ?`; params.push(examType); }
  if (q) {
    sql += ` AND (papers.title LIKE ? OR papers.unitName LIKE ? OR papers.unitCode LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` ORDER BY papers.createdAt DESC`;
  return db.prepare(sql).all(...params);
}
function listPapersByUploader(uploaderId) {
  return db.prepare(`SELECT * FROM papers WHERE uploaderId = ? ORDER BY createdAt DESC`).all(uploaderId);
}
function incrementDownloadCount(id) {
  db.prepare(`UPDATE papers SET downloadCount = downloadCount + 1 WHERE id = ?`).run(id);
}
function setPaperStatus(id, status) {
  db.prepare(`UPDATE papers SET status = ? WHERE id = ?`).run(status, id);
  return getPaperById(id);
}

module.exports = {
  db,
  createUser,
  getUserByRegNumber,
  getUserById,
  createPaper,
  getPaperById,
  listApprovedPapers,
  listPapersByUploader,
  incrementDownloadCount,
  setPaperStatus,
};
