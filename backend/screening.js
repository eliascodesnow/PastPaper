const fs = require("fs");
const sharp = require("sharp");
const BadWordsLib = require("bad-words");
const Filter = BadWordsLib.default || BadWordsLib;

let filter;
if (typeof Filter === "function") {
  filter = new Filter();
} else {
  filter = { isProfane: () => false };
}

const MIN_FILE_BYTES = 1024;
const MIN_PDF_TEXT_CHARS = 40;
const BLUR_SHARPNESS_MIN = 12;
const INK_COVERAGE_MAX = 0.1;

async function checkFileIntegrity(filePath) {
  const stats = fs.statSync(filePath);
  const passed = stats.size >= MIN_FILE_BYTES;
  return { name: "file_integrity", passed, detail: passed ? `${stats.size} bytes` : "File is too small to be a real document" };
}

async function checkPdfHasContent(extractedText) {
  const chars = (extractedText || "").trim().length;
  const passed = chars >= MIN_PDF_TEXT_CHARS;
  return { name: "pdf_content", passed, detail: passed ? `${chars} characters of extractable text` : "Barely any extractable text — looks blank, scanned-as-image with no OCR layer, or corrupt" };
}

async function checkProfanity(textFields) {
  const combined = textFields.filter(Boolean).join(" ");
  const isClean = combined.trim().length === 0 || !filter.isProfane(combined);
  return { name: "language", passed: isClean, detail: isClean ? "No flagged language found" : "Flagged language found in filename/title/extracted text" };
}

async function checkImageClarity(filePath) {
  const kernel = { width: 3, height: 3, kernel: [0,1,0,1,-4,1,0,1,0] };
  const { data, info } = await sharp(filePath).greyscale().convolve(kernel).raw().toBuffer({ resolveWithObject: true });
  const n = data.length;
  let sum = 0; for (let i=0;i<n;i++) sum += data[i];
  const mean = sum/n; let variance = 0; for (let i=0;i<n;i++) variance += (data[i]-mean)**2;
  const stdev = Math.sqrt(variance/n);
  const passed = stdev >= BLUR_SHARPNESS_MIN;
  return { name: "image_clarity", passed, detail: `edge sharpness ${stdev.toFixed(1)} (min ${BLUR_SHARPNESS_MIN}), ${info.width}x${info.height}` };
}

async function checkInkCoverage(filePath) {
  const { data, info } = await sharp(filePath).greyscale().raw().toBuffer({ resolveWithObject: true });
  let dark = 0; for (let i=0;i<data.length;i++) if (data[i] < 120) dark++;
  const ratio = dark / data.length;
  const passed = ratio <= INK_COVERAGE_MAX;
  return { name: "ink_coverage", passed, detail: `${(ratio*100).toFixed(1)}% dark pixel coverage (max ${INK_COVERAGE_MAX*100}%), pages ${info.width}x${info.height}` };
}

let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) pdfjsLibPromise = Promise.resolve(require('pdfjs-dist/legacy/build/pdf.js'));
  return pdfjsLibPromise;
}

async function extractPdfText(filePath) {
  try {
    const pdfjsLib = await loadPdfjs();
    const data = new Uint8Array(fs.readFileSync(filePath));
    const standardFontDataUrl = require('path').join(require.resolve('pdfjs-dist/package.json'), '..', 'standard_fonts') + '/';
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false, standardFontDataUrl }).promise;
    let text = '';
    for (let i=1;i<=doc.numPages;i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  } catch (err) {
    return '';
  }
}

async function screenPaper(filePath, metadata) {
  const checks = [];
  let extractedText = '';
  checks.push(await checkFileIntegrity(filePath));
  if (metadata.fileType === 'pdf') {
    extractedText = await extractPdfText(filePath);
    checks.push(await checkPdfHasContent(extractedText));
  } else {
    checks.push(await checkImageClarity(filePath));
    checks.push(await checkInkCoverage(filePath));
  }
  checks.push(await checkProfanity([metadata.title, metadata.unitName, extractedText]));
  const failed = checks.filter(c => !c.passed);
  const passed = failed.length === 0;
  return { passed, checks, extractedText: extractedText.slice(0,4000), note: 'Lightweight heuristics used.' };
}

module.exports = { screenPaper };