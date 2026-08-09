/**
 * Registration number formats for the faculty.
 *
 * Two families cover every course on offer, and any future one added to
 * the faculty, without needing a new regex per course:
 *
 *  DIPLOMA family  ->  PREFIX-DD-NNNN/YYYY
 *    e.g. DSE-01-0000/2020   (Diploma in Software Engineering)
 *         DIT-02-0310/2020   (Diploma in IT)
 *         DBIT-04-0187/2020  (Diploma in Business IT)
 *         DJMC-01-0099/2020  (Diploma in Journalism & Mass Comm)
 *         DEE-03-0212/2020   (Diploma in Electrical Engineering)
 *
 *  DEGREE family   ->  BSC-XXX-NNNN/YYYY
 *    e.g. BSC-CS-0419/2025   (BSc Computer Science)
 *         BSC-ENG-0234/2024  (BSc Engineering)
 *         BSC-IT-0512/2025   (BSc IT)
 *
 * KNOWN_PREFIXES gives friendly course names for the common ones; anything
 * else that fits either shape is still accepted (generic ICT/media/
 * engineering diploma or degree), just labelled "Other <family>".
 */

const DIPLOMA_REGEX = /^([A-Z]{2,5})-(\d{2})-(\d{3,5})\/(\d{4})$/;
const DEGREE_REGEX = /^BSC-([A-Z]{2,5})-(\d{3,5})\/(\d{4})$/;

const KNOWN_DIPLOMA_PREFIXES = {
  DSE: "Diploma in Software Engineering",
  DIT: "Diploma in Information Technology",
  DBIT: "Diploma in Business Information Technology",
  DJMC: "Diploma in Journalism & Mass Communication",
  DEE: "Diploma in Electrical & Electronics Engineering",
  DCE: "Diploma in Civil Engineering",
  DME: "Diploma in Mechanical Engineering",
  DCS: "Diploma in Computer Science",
  DMD: "Diploma in Multimedia Design",
};

const KNOWN_DEGREE_PREFIXES = {
  CS: "BSc Computer Science",
  IT: "BSc Information Technology",
  SE: "BSc Software Engineering",
  ENG: "BSc Engineering",
  EEE: "BSc Electrical & Electronic Engineering",
  CE: "BSc Civil Engineering",
  JMC: "BSc Journalism & Mass Communication",
};

/**
 * Validate a registration number and resolve it to a course label.
 * Returns { valid, course, family } or { valid: false }.
 */
function resolveRegNumber(rawRegNumber) {
  const regNumber = (rawRegNumber || "").trim().toUpperCase();

  const diplomaMatch = regNumber.match(DIPLOMA_REGEX);
  if (diplomaMatch) {
    const prefix = diplomaMatch[1];
    // BSC is reserved for the degree family, not a diploma prefix.
    if (prefix !== "BSC") {
      const course = KNOWN_DIPLOMA_PREFIXES[prefix] || `Other Diploma (${prefix})`;
      return { valid: true, regNumber, course, family: "DIPLOMA", prefix };
    }
  }

  const degreeMatch = regNumber.match(DEGREE_REGEX);
  if (degreeMatch) {
    const prefix = degreeMatch[1];
    const course = KNOWN_DEGREE_PREFIXES[prefix] || `Other BSc (${prefix})`;
    return { valid: true, regNumber, course, family: "DEGREE", prefix };
  }

  return { valid: false };
}

module.exports = {
  DIPLOMA_REGEX,
  DEGREE_REGEX,
  KNOWN_DIPLOMA_PREFIXES,
  KNOWN_DEGREE_PREFIXES,
  resolveRegNumber,
};
