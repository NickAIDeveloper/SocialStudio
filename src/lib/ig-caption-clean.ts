/**
 * Strip Instagram OEmbed / og:description framing from a caption string.
 *
 * Instagram's og:description on post pages is shaped like:
 *   "1,234 likes, 56 comments - affectly.app on April 6, 2026: \"real caption\""
 *
 * The scraper splits on " - " and takes the right side, which still leaves the
 * "<handle> on <Month> <Day>, <Year>:" header and surrounding quotes in front
 * of the actual caption text. Apply this to every IG caption (whether read
 * from the scraper or from the DB) before display, analysis, or echoing.
 *
 * Pure function. No side effects. Safe on already-clean strings.
 */
export function cleanIgCaption(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();

  // "@handle on April 6, 2026:" or "handle.brand on Apr 6, 2026:"
  // Handle may contain letters, digits, dots, underscores, and a leading '@'.
  const headerRe =
    /^@?[\w.]+\s+on\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}:\s*/i;
  s = s.replace(headerRe, '');

  // Strip wrapping straight or smart quotes that IG injects around the caption.
  s = s.replace(/^[\u201C\u201D"']+|[\u201C\u201D"']+$/g, '');

  return s.trim();
}
