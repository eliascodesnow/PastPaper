const fs = require("fs");
const sharp = require("sharp");
const Filter = require("bad-words");

const filter = new Filter();

// --- Tunable thresholds -----------------------------------------------
const MIN_FILE_BYTES = 1024; // below this, almost certainly empty/corrupt
const MIN_PDF_TEXT_CHARS = 40; // a real past paper has more than a stray line of text
const BLUR_SHARPNESS_MIN = 12; // stdev of edge response; lower = blurrier
const INK_COVERAGE_MAX = 0.1; // fraction of "dark" pixels; higher = overwritten/scribbled (clean printed pages measure ~2-5%)

/**
 * Each check returns { name, passed, detail }. Pushing a new check (e.g. a
 * future OCR-based "is this actually a past paper" classifier, or a proper
 * handwriting-vs-print model) means adding one function here and wiring it
 * into runChecks — nothing else in the upload flow needs to change.
 */

async function checkFileIntegrity(filePath) {
  const stats = fs.statSync(filePath);
  const passed = stats.size >= MIN_FILE_BYTES;
  return {
    name: "file_integrity",
    passed,
    detail: passed ? `${stats.size} bytes` : "File is too small to be a real document",
  };
}

async function checkPdfHasContent(extractedText) {
  const chars = (extractedText || "").trim().length;
  const passed = chars >= MIN_PDF_TEXT_CHARS;
  return {
    name: "pdf_content",
    passed,
    detail: passed
      ? `${chars} characters of extractable text`
      : "Barely any extractable text — looks blank, scanned-as-image with no OCR layer, or corrupt",
  };
}

async function checkProfanity(textFields) {
  const combined = textFields.filter(Boolean).join(" ");
  const isClean = combined.trim().length === 0 || !filter.isProfane(combined);
  return {
    name: "language",
    passed: isClean,
    detail: isClean ? "No flagged language found" : "Flagged language found in filename/title/extracted text",
  };
}

/**
 * Image sharpness via a Laplacian-style edge convolution. A crisp printed
 * page has a wide spread of edge responses; a blurry photo compresses
 * toward the mean (low stdev).
 */
async function checkImageClarity(filePath) {
  const kernel = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] };
  const { data, info } = await sharp(filePath)
    .greyscale()
    .convolve(kernel)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = data.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (data[i] - mean) ** 2;
  const stdev = Math.sqrt(variance / n);

  const passed = stdev >= BLUR_SHARPNESS_MIN;
  return {
    name: "image_clarity",
    passed,
    detail: `edge sharpness ${stdev.toFixed(1)} (min ${BLUR_SHARPNESS_MIN}), ${info.width}x${info.height}`,
  };
}

/**
 * Proxy for "too many handwritten annotations": ratio of dark pixels to
 * total pixels. Clean printed exam papers sit well under the threshold;
 * scans covered in pen marks/highlighting push the ratio up.
 */
async function checkInkCoverage(filePath) {
  const { data, info } = await sharp(filePath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let dark = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < 120) dark++;
  }
  const ratio = dark / data.length;
  const passed = ratio <= INK_COVERAGE_MAX;
  return {
    name: "ink_coverage",
    passed,
    detail: `${(ratio * 100).toFixed(1)}% dark pixel coverage (max ${INK_COVERAGE_MAX * 100}%), pages ${info.width}x${info.height}`,
  };
}

/**
 * PDF text extraction via pdfjs-dist (current, well-maintained pdf.js).
 * We deliberately avoid the popular "pdf-parse" package here: it bundles a
 * very old pdf.js that throws "bad XRef entry" on PDFs from several common
 * generators (reportlab, some phone-scanner apps) even though the files are
 * perfectly valid — which would silently mislabel real past papers as
 * blank. pdfjs-dist is ESM-only, hence the dynamic import in this
 * CommonJS file.
 */
let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsLibPromise;
}

async function extractPdfText(filePath) {
  try {
    const pdfjsLib = await loadPdfjs();
    const data = new Uint8Array(fs.readFileSync(filePath));
    const standardFontDataUrl = require("path").join(require.resolve("pdfjs-dist/package.json"), "..", "standard_fonts") + "/";
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false, standardFontDataUrl }).promise;

    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n";
    }
    return text;
  } catch (err) {
    return ""; // treated as "no extractable text" downstream — fails safe to REJECTED
  }
}

/**
 * Run the full screening pipeline for one uploaded file.
 * metadata: { title, unitName, fileType } fileType is "pdf" | "image"
 */
async function screenPaper(filePath, metadata) {
  const checks = [];
  let extractedText = "";

  checks.push(await checkFileIntegrity(filePath));

  if (metadata.fileType === "pdf") {
    extractedText = await extractPdfText(filePath);
    checks.push(await checkPdfHasContent(extractedText));
  } else {
    // Image checks are skipped for PDFs for now — rendering PDF pages to
    // images for clarity/ink checks is a natural next step once this
    // pipeline is upgraded (see OCR note below).
    checks.push(await checkImageClarity(filePath));
    checks.push(await checkInkCoverage(filePath));
  }

  checks.push(await checkProfanity([metadata.title, metadata.unitName, extractedText]));

  const failed = checks.filter((c) => !c.passed);
  const passed = failed.length === 0;

  return {
    passed,
    checks,
    extractedText: extractedText.slice(0, 4000), // handed to the categorizer, capped for storage
    note:
      "MVP screening uses lightweight heuristics (file size, edge-sharpness, ink coverage, word filter). " +
      "Swap in an OCR pass (e.g. Tesseract) + a handwriting classifier here for stronger accuracy — " +
      "the pipeline shape (checks[]) doesn't need to change.",
  };
}

module.exports = { screenPaper };
