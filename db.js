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

  -- Helpful indexes to avoid full table scans on common filters and joins
  CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
  CREATE INDEX IF NOT EXISTS idx_papers_uploaderId ON papers(uploaderId);
  CREATE INDEX IF NOT EXISTS idx_papers_course_year_exam ON papers(course, year, examType);
  CREATE INDEX IF NOT EXISTS idx_papers_year ON papers(year);
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
  // Return the inserted object's representation without issuing a second
  // SELECT — avoids the N+1 pattern. Fill server-side defaults conservatively.
  const now = new Date().toISOString();
  return {
    id,
    title: paper.title,
    unitCode: paper.unitCode || null,
    unitName: paper.unitName || null,
    course: paper.course,
    examType: paper.examType,
    year: paper.year,
    fileName: paper.fileName,
    filePath: paper.filePath,
    fileType: paper.fileType,
    status: paper.status || "PENDING",
    rejectionReason: paper.rejectionReason || null,
    screeningReport: paper.screeningReport || null,
    downloadCount: 0,
    uploaderId: paper.uploaderId,
    createdAt: now,
  };
}
function getPaperById(id) {
  return db.prepare(`SELECT * FROM papers WHERE id = ?`).get(id);
}
function listApprovedPapers({ course, unitCode, year, examType, q, limit = 20, page = 1 } = {}) {
  let sql = `SELECT papers.*, users.name AS uploaderName FROM papers JOIN users ON users.id = papers.uploaderId WHERE papers.status = 'APPROVED'`;
  const params = [];
  if (course) { sql += ` AND papers.course = ?`; params.push(course); }
  if (unitCode) { sql += ` AND papers.unitCode = ?`; params.push(unitCode); }
  if (year) { sql += ` AND papers.year = ?`; params.push(year); }
  if (examType) { sql += ` AND papers.examType = ?`; params.push(examType); }
  if (q) {
    // Use a prefix match to allow index usage where possible. For full-text
    // search at scale prefer FTS5 — this is a safe incremental improvement.
    sql += ` AND (papers.title LIKE ? OR papers.unitName LIKE ? OR papers.unitCode LIKE ?)`;
    const like = `${q}%`;
    params.push(like, like, like);
  }
  sql += ` ORDER BY papers.createdAt DESC LIMIT ? OFFSET ?`;
  params.push(limit, (page - 1) * limit);
  return db.prepare(sql).all(...params);
}

function countApprovedPapers({ course, unitCode, year, examType, q } = {}) {
  let sql = `SELECT COUNT(1) AS cnt FROM papers WHERE status = 'APPROVED'`;
  const params = [];
  if (course) { sql += ` AND course = ?`; params.push(course); }
  if (unitCode) { sql += ` AND unitCode = ?`; params.push(unitCode); }
  if (year) { sql += ` AND year = ?`; params.push(year); }
  if (examType) { sql += ` AND examType = ?`; params.push(examType); }
  if (q) {
    sql += ` AND (title LIKE ? OR unitName LIKE ? OR unitCode LIKE ?)`;
    const like = `${q}%`;
    params.push(like, like, like);
  }
  const row = db.prepare(sql).get(...params);
  return row ? row.cnt : 0;
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
  countApprovedPapers,
  listPapersByUploader,
  incrementDownloadCount,
  setPaperStatus,
};
