const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("./db");
const { requireAuth } = require("./auth2");
const { screenPaper } = require("./screening");
const { categorize } = require("./categorize");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  },
});

function fileTypeOf(mimetype) {
  return mimetype === "application/pdf" ? "pdf" : "image";
}

// --- Upload -------------------------------------------------------------
router.post("/", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File is larger than the 20MB limit." });
      }
      return res.status(400).json({ error: "Upload failed — check the file and try again." });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Attach a PDF, JPG, PNG, or WEBP file." });
  }
  const { title, unitName, examType, year } = req.body;
  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Give the paper a title (e.g. the unit name)." });
  }

  const fileType = fileTypeOf(req.file.mimetype);

  try {
    const screening = await screenPaper(req.file.path, { title, unitName, fileType });
    const suggested = categorize({ title, unitName, extractedText: screening.extractedText });

    const status = screening.passed ? "APPROVED" : "REJECTED";
    const rejectionReason = screening.passed
      ? null
      : screening.checks.filter((c) => !c.passed).map((c) => c.detail).join("; ");

    const paper = db.createPaper({
      title,
      unitCode: suggested.suggestedUnitCode,
      unitName: unitName || null,
      course: req.user.course,
      examType: examType || suggested.examType,
      year: year ? parseInt(year, 10) : suggested.suggestedYear || new Date().getFullYear(),
      fileName: req.file.originalname,
      filePath: req.file.filename,
      fileType,
      status,
      rejectionReason,
      screeningReport: JSON.stringify(screening.checks),
      uploaderId: req.user.id,
    });

    res.status(201).json({ paper, screening: { passed: screening.passed, checks: screening.checks } });
  } catch (err) {
    fs.unlinkSync(req.file.path);
    console.error(err);
    res.status(500).json({ error: "Screening failed unexpectedly. Please try again." });
  }
});

// --- Public browsing (approved only, open to the whole community) -------
router.get("/", (req, res) => {
  const { course, unitCode, year, examType, q, page = "1", limit = "20" } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));

  const papers = db.listApprovedPapers({
    course,
    unitCode,
    year: year ? parseInt(year, 10) : undefined,
    examType,
    q,
    limit: lim,
    page: pageNum,
  });

  const total = db.countApprovedPapers({ course, unitCode, year: year ? parseInt(year, 10) : undefined, examType, q });

  res.json({ papers, page: pageNum, limit: lim, total });
});

router.get("/mine", requireAuth, (req, res) => {
  res.json(db.listPapersByUploader(req.user.id));
});

router.get("/:id/download", (req, res) => {
  const paper = db.getPaperById(req.params.id);
  if (!paper || paper.status !== "APPROVED") {
    return res.status(404).json({ error: "Paper not found." });
  }
  db.incrementDownloadCount(paper.id);
  // Allow caching of approved PDFs at the CDN/browser for a short time.
  res.set("Cache-Control", "public, max-age=604800, immutable"); // 7 days
  res.download(path.join(UPLOAD_DIR, paper.filePath), paper.fileName);
});

// --- Admin: manual override for a heuristic misfire ----------------------
router.post("/:id/override", requireAuth, (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admins only." });
  const { status } = req.body; // "APPROVED" | "REJECTED"
  if (!["APPROVED", "REJECTED"].includes(status)) {
    return res.status(400).json({ error: "status must be APPROVED or REJECTED." });
  }
  const paper = db.setPaperStatus(req.params.id, status);
  res.json(paper);
});

module.exports = router;
