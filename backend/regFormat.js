// (restored regFormat.js)
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

function resolveRegNumber(rawRegNumber) {
  const regNumber = (rawRegNumber || "").trim().toUpperCase();
  const diplomaMatch = regNumber.match(DIPLOMA_REGEX);
  if (diplomaMatch) {
    const prefix = diplomaMatch[1];
    if (prefix !== 'BSC') {
      const course = KNOWN_DIPLOMA_PREFIXES[prefix] || `Other Diploma (${prefix})`;
      return { valid: true, regNumber, course, family: 'DIPLOMA', prefix };
    }
  }
  const degreeMatch = regNumber.match(DEGREE_REGEX);
  if (degreeMatch) {
    const prefix = degreeMatch[1];
    const course = KNOWN_DEGREE_PREFIXES[prefix] || `Other BSc (${prefix})`;
    return { valid: true, regNumber, course, family: 'DEGREE', prefix };
  }
  return { valid: false };
}

module.exports = { resolveRegNumber, DIPLOMA_REGEX, DEGREE_REGEX, KNOWN_DIPLOMA_PREFIXES, KNOWN_DEGREE_PREFIXES };