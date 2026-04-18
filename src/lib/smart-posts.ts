// Derives a generation "seed" from a real InsightCard produced by insights-engine.ts.
// Pure — no DB, no HTTP. Consumed by /api/smart-posts/generate.
//
// The seed tells the caption and image pipeline WHAT to generate based on the
// user's actual performance data. We only map insight types that are truly
// actionable; diagnostic-only types (engagement-benchmark, consistency-score,
// post-leaderboard) return null so the UI hides the Generate button on them.

import type { InsightCard } from './health-score';
import type { OverlayStyle, TextPosition, ContentType } from './domain-types';

export interface GenerationSeed {
  brandId: string;
  contentType: ContentType;
  overlayStyle: OverlayStyle;
  textPosition: TextPosition;
  topicHint?: string;
  hookPattern?: string;
  // Target caption length bucket from `caption-length` insight.
  captionLengthHint?: 'short' | 'medium' | 'long';
  // Structural caption pattern (e.g. { type: 'lists', label: 'Lists/Tips' })
  // from the winning `caption-patterns` insight.
  captionPatternHint?: { type: string; label: string };
  // Tone nudge from `momentum` when engagement is trending down.
  toneHint?: 'community';
  avoidTopics: string[];
  suggestedPostTime?: { day: string; hour: number };
  reasoning: string;
}

const DEFAULT_OVERLAY: OverlayStyle = 'editorial';
const DEFAULT_POSITION: TextPosition = 'center';

// Mirrors the time-block labels emitted by insights-engine buildOptimalTiming.
const TIME_BLOCK_HOURS: Record<string, number> = {
  'Early Morning': 6,
  'Early morning': 6,
  Morning: 9,
  Midday: 12,
  Afternoon: 14,
  Evening: 19,
  Night: 21,
};

function normalizeContentType(raw: string | undefined | null): ContentType {
  const t = (raw || '').toLowerCase();
  if (t.includes('carousel')) return 'carousel';
  if (t === 'reel' || t === 'video') return 'tip';
  if (t === 'image' || t === 'photo') return 'quote';
  if (t === 'promo' || t === 'quote' || t === 'tip' || t === 'community' || t === 'carousel') {
    return t as ContentType;
  }
  return 'quote';
}

// User-facing labels for our internal ContentType enum. These are the words
// the user sees in "Why this works" — "quote post" / "tip post" read as
// internal jargon, so we phrase each type naturally instead.
const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  quote: 'quote graphic',
  tip: 'tip-style post',
  carousel: 'carousel',
  community: 'community post',
  promo: 'promo post',
};

const ACTIONABLE_TYPES = new Set([
  'best-content-type',
  'optimal-timing',
  'top-post',
  'caption-length',
  'caption-patterns',
  'momentum',
  'hashtag-health',
  'worst-post',
]);

export function seedFromInsight(card: InsightCard, brandId: string): GenerationSeed | null {
  if (!ACTIONABLE_TYPES.has(card.type)) return null;

  const base: GenerationSeed = {
    brandId,
    contentType: 'quote',
    overlayStyle: DEFAULT_OVERLAY,
    textPosition: DEFAULT_POSITION,
    avoidTopics: [],
    reasoning: card.summary,
  };

  const data = (card.data ?? {}) as Record<string, unknown>;

  switch (card.type) {
    case 'best-content-type': {
      const types = data.types as Array<{ type: string; avgEngagement: number; count: number }> | undefined;
      const best = types?.[0];
      if (!best) return null;
      return {
        ...base,
        contentType: normalizeContentType(best.type),
        reasoning: `Your ${best.type} posts average ${Math.round(best.avgEngagement)} engagement across ${best.count} posts, so we generated another one.`,
      };
    }

    case 'optimal-timing': {
      const bestDay = data.bestDay as string | undefined;
      const bestTime = data.bestTime as string | undefined;
      if (!bestDay || !bestTime) return null;
      // Case-insensitive lookup — insights-engine sometimes emits lowercase
      // ("evening") and TIME_BLOCK_HOURS keys are capitalized. Without this
      // normalization the UI confidently says "Tuesday 12:00" when the
      // learning actually said Tuesday evening — an honesty regression.
      const tbKey = Object.keys(TIME_BLOCK_HOURS).find(
        (k) => k.toLowerCase() === bestTime.toLowerCase(),
      );
      const hour = tbKey ? TIME_BLOCK_HOURS[tbKey] : 12;
      return {
        ...base,
        suggestedPostTime: { day: bestDay, hour },
        reasoning: `${bestDay} ${bestTime} is your strongest posting window, so we scheduled it there.`,
      };
    }

    case 'top-post': {
      const post = data.post as { caption?: string; contentType?: string } | undefined;
      if (!post) return null;
      const firstLine = (post.caption ?? '').split('\n')[0].trim().slice(0, 80);
      return {
        ...base,
        contentType: normalizeContentType(post.contentType),
        hookPattern: firstLine || undefined,
        reasoning: firstLine
          ? `We echoed the opening line from your top post: "${firstLine}".`
          : 'We replicated the elements of your top performing post.',
      };
    }

    case 'caption-length': {
      const bestRange = String(data.bestRange ?? '').toLowerCase();
      // Length is orthogonal to content framework — emit a hint, don't
      // hijack contentType.
      let captionLengthHint: 'short' | 'medium' | 'long' = 'medium';
      if (bestRange.includes('short')) captionLengthHint = 'short';
      else if (bestRange.includes('long')) captionLengthHint = 'long';
      return {
        ...base,
        captionLengthHint,
        reasoning: `${bestRange || 'Medium'} captions perform best for your account, so we wrote one that length.`,
      };
    }

    case 'caption-patterns': {
      // Real shape from insights-engine: data.patterns = [{ type, label, lift, avgEngagement, count }]
      const patterns = data.patterns as
        | Array<{ type?: string; label?: string; lift?: number }>
        | undefined;
      const top = patterns?.[0];
      if (!top?.type || !top.label) return null;
      return {
        ...base,
        captionPatternHint: { type: top.type, label: top.label },
        reasoning: `We used your winning caption pattern (${top.label}) to structure the copy.`,
      };
    }

    case 'momentum': {
      const trend = data.trend as string | undefined;
      if (trend !== 'down') return null; // only actionable when trending down
      return {
        ...base,
        contentType: 'community',
        reasoning: 'Engagement is dipping, so we generated a relatable community post to reconnect.',
      };
    }

    case 'hashtag-health': {
      const drop = (data.drop as string[] | undefined) ?? [];
      return {
        ...base,
        avoidTopics: drop.slice(0, 5),
        reasoning: drop.length
          ? `We steered clear of underperforming tags like ${drop.slice(0, 3).join(', ')}.`
          : 'We rebalanced your hashtag strategy to drop low performers.',
      };
    }

    case 'worst-post': {
      const post = data.post as { caption?: string } | undefined;
      const snippet = (post?.caption ?? '').split(/\s+/).slice(0, 3).join(' ');
      return {
        ...base,
        avoidTopics: snippet ? [snippet] : [],
        reasoning: 'We avoided themes from your lowest performing post.',
      };
    }

    default:
      return null;
  }
}

export function isActionable(card: InsightCard): boolean {
  // Cheap check — avoids threading a brandId through the predicate.
  if (!ACTIONABLE_TYPES.has(card.type)) return false;
  if (card.type === 'momentum') {
    return (card.data as Record<string, unknown> | undefined)?.trend === 'down';
  }
  return true;
}

// Merges every actionable insight into ONE composite seed — the "perfect post"
// that embeds every learning. Each insight owns its own field, so multiple
// insights never fight for the same slot:
//   best-content-type  → contentType (framework: quote/tip/community/carousel/promo)
//   caption-length     → captionLengthHint (short/medium/long, orthogonal to framework)
//   caption-patterns   → captionPatternHint (structural pattern like lists/questions)
//   top-post           → hookPattern (opener to echo) + topicHint (image query)
//   optimal-timing     → suggestedPostTime (resolved to scheduledAt downstream)
//   hashtag-health     → avoidTopics (underperforming tags)
//   worst-post         → avoidTopics (dead themes)
//   momentum (down)    → toneHint='community'
// `contributions` maps each insight type to a concrete, human-readable string
// describing EXACTLY what that insight did. An actionable insight should
// almost always end up in the map — if it doesn't, its underlying data was
// empty/null and the UI will mark it "Not used this run".
export function mergePerfectSeed(
  cards: InsightCard[],
  brandId: string,
): { seed: GenerationSeed; contributions: Record<string, string> } | null {
  const actionableCards = cards.filter(isActionable);
  if (actionableCards.length === 0) return null;

  const seed: GenerationSeed = {
    brandId,
    contentType: 'quote',
    overlayStyle: DEFAULT_OVERLAY,
    textPosition: DEFAULT_POSITION,
    avoidTopics: [],
    reasoning: '',
  };
  const contributions: Record<string, string> = {};
  const avoid = new Set<string>();

  const byType = new Map<string, InsightCard>();
  for (const c of actionableCards) byType.set(c.type, c);

  // 1. Framework — best-content-type wins; caption-length is a length, not a framework.
  const bct = byType.get('best-content-type');
  if (bct) {
    const partial = seedFromInsight(bct, brandId);
    if (partial) {
      seed.contentType = partial.contentType;
      contributions['best-content-type'] =
        `We picked a ${CONTENT_TYPE_LABEL[partial.contentType]} because that format performs best for your account.`;
    }
  }

  // 2. Caption length — orthogonal to framework. Always contributes.
  const cl = byType.get('caption-length');
  if (cl) {
    const partial = seedFromInsight(cl, brandId);
    if (partial?.captionLengthHint) {
      seed.captionLengthHint = partial.captionLengthHint;
      contributions['caption-length'] =
        `We wrote a ${partial.captionLengthHint} caption because that length drives the most engagement for you.`;
    }
  }

  // 3. Caption pattern — structural directive for the LLM prompt.
  const cp = byType.get('caption-patterns');
  if (cp) {
    const partial = seedFromInsight(cp, brandId);
    if (partial?.captionPatternHint) {
      seed.captionPatternHint = partial.captionPatternHint;
      contributions['caption-patterns'] =
        `We structured the caption as "${partial.captionPatternHint.label}" because that pattern wins for you.`;
    }
  }

  // 4. Top post — always contributes hook echo + topic hint.
  const tp = byType.get('top-post');
  if (tp) {
    const partial = seedFromInsight(tp, brandId);
    if (partial?.hookPattern) {
      seed.hookPattern = partial.hookPattern;
      const firstWords = partial.hookPattern.split(/\s+/).slice(0, 3).join(' ');
      if (firstWords) seed.topicHint = firstWords;
      const snippet = `${partial.hookPattern.slice(0, 60)}${partial.hookPattern.length > 60 ? '...' : ''}`;
      contributions['top-post'] =
        `We echoed the opener from your top post: "${snippet}".`;
    }
  }

  // 5. Optimal timing — CONCRETELY honored at schedule time.
  const ot = byType.get('optimal-timing');
  if (ot) {
    const partial = seedFromInsight(ot, brandId);
    if (partial?.suggestedPostTime) {
      seed.suggestedPostTime = partial.suggestedPostTime;
      const hh = String(partial.suggestedPostTime.hour).padStart(2, '0');
      contributions['optimal-timing'] =
        `We scheduled it for ${partial.suggestedPostTime.day} at ${hh}:00, your strongest posting window.`;
    }
  }

  // 6. Hashtag health — avoid list.
  const hh = byType.get('hashtag-health');
  if (hh) {
    const partial = seedFromInsight(hh, brandId);
    if (partial && partial.avoidTopics.length > 0) {
      partial.avoidTopics.forEach((t) => avoid.add(t));
      contributions['hashtag-health'] =
        `We steered clear of underperforming hashtags like ${partial.avoidTopics.slice(0, 3).join(', ')}.`;
    }
  }

  // 7. Worst post — avoid themes.
  const wp = byType.get('worst-post');
  if (wp) {
    const partial = seedFromInsight(wp, brandId);
    if (partial && partial.avoidTopics.length > 0) {
      partial.avoidTopics.forEach((t) => avoid.add(t));
      contributions['worst-post'] =
        `We avoided themes like "${partial.avoidTopics[0]}" because similar posts underperformed.`;
    }
  }

  // 8. Momentum (down-trending only) — tone nudge toward community copy.
  const mom = byType.get('momentum');
  if (mom) {
    const partial = seedFromInsight(mom, brandId);
    if (partial) {
      seed.toneHint = 'community';
      contributions['momentum'] =
        `We leaned into a community tone because your engagement has been dipping recently.`;
    }
  }

  seed.avoidTopics = Array.from(avoid);
  seed.reasoning = Object.values(contributions).join('\n');

  return { seed, contributions };
}
