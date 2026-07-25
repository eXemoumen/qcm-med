/**
 * Shared correct-answers parser.
 * Validates each token individually rather than the whole string.
 */
export function parseCorrectAnswers(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const cleaned = raw.replace(/\s/g, '').toUpperCase();

  // Handle comma-separated: "A,B" or "A, B" or "A,,B"
  if (cleaned.includes(',')) {
    return cleaned
      .split(',')
      .map((t) => t.trim())
      .filter((t) => /^[A-E]$/.test(t));
  }

  // Handle single string: "AB" → ["A", "B"], "A" → ["A"], "F" → []
  if (/^[A-E]+$/.test(cleaned) && cleaned.length <= 5) {
    return cleaned.split('');
  }

  // Invalid: contains non A-E chars or too many letters
  return [];
}
