// Guarantees a non-empty image-overlay hook.
//
// Why this exists:
//   The image renderer (createInstagramImageWithText → sharp/libvips vips_text)
//   THROWS "text: no text to render" when handed empty text. The caption step
//   (/api/captions) can legitimately return hookText: '' at HTTP 200 — the model
//   occasionally omits the field. The old fallback chain
//   `captionPayload.hookText ?? seed.hookPattern ?? 'Save this'` used `??`, which
//   does NOT substitute an empty string, so the 'Save this' safety net never
//   fired and an empty hook crashed god-mode (HTTP 500 → autopilot shipped
//   nothing). This helper uses falsy checks + a caption-derived fallback so the
//   overlay text is ALWAYS non-empty.

const LAST_RESORT_HOOK = 'Save this';

/**
 * Derives a short hook from a caption: the first sentence (or first non-empty
 * line) with surrounding punctuation/whitespace stripped. Returns '' when the
 * caption has no usable letters/numbers (e.g. emoji-only), so callers can fall
 * through to the next candidate.
 */
export function deriveHookFromCaption(caption?: string | null): string {
  const text = (caption ?? '').trim();
  if (!text) return '';
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0] ?? firstLine;
  const cleaned = firstSentence
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Require at least one letter or digit so emoji/punctuation-only text doesn't
  // produce a "hook" the renderer would still choke on.
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : '';
}

/**
 * Returns a guaranteed-non-empty overlay hook. Precedence: explicit hookText →
 * first sentence of the (fresh) caption → a non-empty constant. Each candidate
 * is trimmed and only used when truthy, so an empty string never slips through
 * to the renderer (the bug this originally fixed).
 *
 * NOTE: the brand's winning `hookPattern` was DELIBERATELY removed from this
 * chain. It is the stale top-post opener ("Your pace is hiding"); using it as a
 * fallback made every hook-less generation deterministically repeat that line —
 * a driver of the mode collapse. Falling back to the fresh caption keeps the
 * overlay on-topic without reintroducing the repeat.
 */
export function resolveHook(parts: {
  hookText?: string | null;
  caption?: string | null;
}): string {
  const candidates = [
    parts.hookText,
    deriveHookFromCaption(parts.caption),
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate ?? '').trim();
    if (trimmed) return trimmed;
  }
  return LAST_RESORT_HOOK;
}
