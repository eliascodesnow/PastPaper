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
async function checkImageClarityFromBuffer(data/*image buffer*/, info) {
  const kernel = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] };
  // Use sharp on the original image buffer, convert to greyscale and convolve
  // — this avoids re-reading from disk while keeping the convolution logic.
  const conv = await sharp(data)
    .greyscale()
    .convolve(kernel)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = conv.data;
  const n = pixels.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += pixels[i];
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (pixels[i] - mean) ** 2;
  const stdev = Math.sqrt(variance / n);

  const passed = stdev >= BLUR_SHARPNESS_MIN;
  const w = conv.info && conv.info.width ? conv.info.width : (info && info.width) || 0;
  const h = conv.info && conv.info.height ? conv.info.height : (info && info.height) || 0;
  return {
    name: "image_clarity",
    passed,
    detail: `edge sharpness ${stdev.toFixed(1)} (min ${BLUR_SHARPNESS_MIN}), ${w}x${h}`,
  };
}

async function checkInkCoverageFromBuffer(data, info) {
  const pixels = data;
  let dark = 0;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] < 120) dark++;
  }
  const ratio = dark / pixels.length;
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

    // Extract pages in parallel (safe for moderate page counts). If this
    // becomes a hotspot, add a concurrency limiter (e.g. p-limit) to avoid
    // saturating memory on very large PDFs.
    const pagePromises = [];
    for (let i = 1; i <= doc.numPages; i++) {
      pagePromises.push(
        doc.getPage(i).then((page) =>
          page.getTextContent().then((content) => content.items.map((it) => it.str).join(" "))
        )
      );
    }
    const pageTexts = await Promise.all(pagePromises);
    return pageTexts.join("\n");
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
    // Image checks are skipped for PDFs for now. For uploaded images, read
    // the file once into memory and run both checks against that buffer to
    // avoid double disk reads and duplicate conversions.
    const imageBuffer = fs.readFileSync(filePath);
    const grey = await sharp(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
    // Run clarity on a convolved greyscale copy and ink coverage on raw greyscale
    const clarity = await checkImageClarityFromBuffer(imageBuffer, { width: grey.info.width, height: grey.info.height, channels: grey.info.channels });
    const ink = await checkInkCoverageFromBuffer(grey.data, { width: grey.info.width, height: grey.info.height, channels: grey.info.channels });
    checks.push(clarity);
    checks.push(ink);
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
