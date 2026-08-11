// Simple categorizer fallback for missing original implementation
module.exports = {
  categorize({ title, unitName, extractedText }) {
    // naive guesses: year from title or current year
    const yearMatch = (title || "").match(/(20\d{2})/);
    const suggestedYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
    return {
      suggestedUnitCode: null,
      suggestedYear,
      examType: "Uncategorized",
    };
  },
};