const EXAM_TYPE_PATTERNS = [
    { label: "Supplementary", regex: /supplementary|special\s*exam|resit/i },
    { label: "Main Exam", regex: /end\s*of\s*semester|main\s*exam|final\s*exam/i },
    { label: "CAT", regex: /\bcat\b|continuous assessment/i },
    { label: "Assignment", regex: /assignment|homework/i },
  ];
  
  const UNIT_CODE_REGEX = /\b([A-Z]{2,5}\s?\d{3,4})\b/g; // e.g. "BIT 2103", "CS2201"
  // Words that match the shape above but are never real unit codes — exam
  // labels followed by a year ("CAT 2025", "MAIN 2024") are the common trap.
  const UNIT_CODE_STOPWORDS = new Set(["CAT", "MAIN", "EXAM", "YEAR", "SUPP", "TEST"]);
  
  /**
   * Suggest a category for a paper from whatever text we have: the
   * uploader-supplied title/unit name, plus any text extracted during
   * screening (PDF text layer today; OCR output once that's wired in).
   */
  function categorize({ title, unitName, extractedText }) {
    const haystack = [title, unitName, extractedText].filter(Boolean).join(" \n ");
  
    let examType = "Uncategorized";
    for (const { label, regex } of EXAM_TYPE_PATTERNS) {
      if (regex.test(haystack)) {
        examType = label;
        break;
      }
    }
  
    let suggestedUnitCode = null;
    for (const match of haystack.matchAll(UNIT_CODE_REGEX)) {
      const letters = match[1].match(/^[A-Z]+/)[0];
      if (!UNIT_CODE_STOPWORDS.has(letters)) {
        suggestedUnitCode = match[1].toUpperCase().replace(/\s+/, " ");
        break;
      }
    }
  
    const yearMatch = haystack.match(/\b(20\d{2})\b/);
    const suggestedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  
    return { examType, suggestedUnitCode, suggestedYear };
  }
  
  module.exports = { categorize };
  