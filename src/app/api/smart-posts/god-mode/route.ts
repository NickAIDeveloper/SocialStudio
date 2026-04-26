import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { generateFromSeed, sanitizeMetaOverrides } from '@/lib/smart-posts/generate';
import { buildDeepProfile } from '@/lib/meta/deep-profile';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

// Allow longer runtime — deep profile fetch + LLM design + image compositing.
export const maxDuration = 60;

// Minimum recent posts on the connected IG account before god-mode will try
// to design one. Below this we don't have enough signal in the deep profile.
const MIN_SAMPLE_SIZE = 5;

// LLM call params — matches analyze/route.ts pattern.
const LLM_TEMP = 0.4;
const LLM_MAX_TOKENS = 600;

const SYSTEM_PROMPT =
  'You are designing a single Instagram post to maximize engagement for one specific account. ' +
  "You will be given the account's full performance profile in JSON. " +
  'Reply with JSON only, no commentary, no markdown fences. No em dashes. No arrows. No AI tells.';

type ParseResult = { ok: true; data: unknown } | { ok: false; raw: string };

// Strip ```json ... ``` (or plain ```) fences. Cerebras wraps output in them
// despite the "no markdown fences" system prompt instruction.
function stripMarkdownFences(s: string): string {
  const fenced = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  return fenced ? fenced[1].trim() : s;
}

// Walk the string tracking string/escape state so braces inside JSON string
// literals don't confuse depth tracking. Returns the first balanced object.
function extractFirstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Cerebras sometimes wraps JSON in ```json blocks or adds trailing commentary
// (which may itself contain braces and break a naive lastIndexOf('}') pass).
// Try: clean parse after fence strip, then balanced-brace extraction.
function parseLlmJson(raw: string): ParseResult {
  const stripped = stripMarkdownFences(raw.trim());
  try {
    return { ok: true, data: JSON.parse(stripped) };
  } catch {
    // fall through
  }
  const balanced = extractFirstJsonObject(stripped);
  if (balanced) {
    try {
      return { ok: true, data: JSON.parse(balanced) };
    } catch {
      // fall through
    }
  }
  return { ok: false, raw };
}

// Cerebras occasionally returns malformed JSON or omits a required field.
// Rather than 502'ing the user, fall back to the deterministic generate path
// so they still get a post built from real insights — just without the LLM
// rationale. The raw output is logged for telemetry.
async function generateFallback(opts: {
  brandId: string;
  userId: string;
  origin: string;
  cookie: string;
  profile: DeepProfile;
  reason: string;
  raw: string;
  igUserId?: string;
  learningIds?: string[];
}) {
  console.warn(
    `[SmartPosts/god-mode/fallback] reason=${opts.reason}, falling back to standard generate. Raw (first 500):`,
    opts.raw.slice(0, 500),
  );
  const outcome = await generateFromSeed({
    brandId: opts.brandId,
    userId: opts.userId,
    origin: opts.origin,
    cookie: opts.cookie,
    igUserId: opts.igUserId,
    learningIds: opts.learningIds,
  });
  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.err.error, message: outcome.err.message },
      { status: outcome.err.status },
    );
  }
  return NextResponse.json({
    ...outcome.data,
    deepProfile: opts.profile,
    godModeFellBack: true,
    godModeFellBackReason: opts.reason,
  });
}

// Trim large arrays out of the deep profile before stringifying for the LLM.
// The heatmap (7x24 number-or-null) and exampleCaptions are noisy in tokens
// without changing the design decision. bestSlots is the more useful summary.
function compactProfileForPrompt(profile: DeepProfile) {
  return {
    handle: profile.handle,
    followerCount: profile.followerCount,
    sampleSize: profile.sampleSize,
    medians: profile.medians,
    formatPerformance: profile.formatPerformance,
    hookPatterns: profile.hookPatterns.map((h) => ({
      pattern: h.pattern,
      avgReach: h.avgReach,
      occurrences: h.occurrences,
    })),
    captionLengthSweetSpot: profile.captionLengthSweetSpot,
    timing: { bestSlots: profile.timing.bestSlots },
    topicSignals: profile.topicSignals,
    audience: profile.audience ?? null,
  };
}

function buildUserPrompt(profile: DeepProfile, likeOfMediaId?: string): string {
  const compact = compactProfileForPrompt(profile);
  const likeOfLine = likeOfMediaId
    ? `The user wants this new post to be similar in style and angle to their existing top performer with media id ${likeOfMediaId}. Use that post's apparent format and topic as the anchor, not the account medians.\n\n`
    : '';
  return [
    "Below is the account's full performance profile. Use the actual numbers.",
    '',
    'PROFILE_JSON:',
    JSON.stringify(compact, null, 2),
    '',
    likeOfLine + 'Design ONE Instagram post that has the best chance of beating this account\'s median reach.',
    'Reply with this exact JSON shape, and nothing else:',
    '{',
    '  "overrides": {',
    '    "format": "REEL" | "CAROUSEL" | "IMAGE",',
    '    "day": "Monday".."Sunday",',
    '    "hour": 0-23,',
    '    "pattern": "<short caption hook pattern, max 60 chars>",',
    '    "preset": "<short topic or angle seed, max 200 chars>"',
    '  },',
    '  "rationale": "<4 to 6 plain English sentences citing specific numbers from the profile, e.g. \'Carousels reach 2.3x your median\' instead of \'carousels work well\'>"',
    '}',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    let body: { brandId?: string; igUserId?: string; likeOfMediaId?: string; learningIds?: string[] };
    try {
      body = await req.json();
    } catch (err) {
      console.warn('[SmartPosts/god-mode] invalid JSON body:', err);
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be valid JSON.' },
        { status: 400 },
      );
    }
    const { brandId, igUserId, likeOfMediaId, learningIds } = body;
    const cleanLearningIds = Array.isArray(learningIds)
      ? learningIds.filter((s): s is string => typeof s === 'string' && s.length > 0)
      : undefined;

    if (!brandId) {
      return NextResponse.json(
        { error: 'brandId_required', message: 'brandId required, pick a brand first.' },
        { status: 400 },
      );
    }
    if (!igUserId) {
      return NextResponse.json(
        { error: 'igUserId_required', message: 'igUserId required, pick an Instagram account first.' },
        { status: 400 },
      );
    }

    if (!isCerebrasAvailable()) {
      return NextResponse.json(
        { error: 'ai_unconfigured', message: 'AI is not configured on this server.' },
        { status: 503 },
      );
    }

    let profile: DeepProfile;
    try {
      profile = await buildDeepProfile({ userId, igUserId });
    } catch (e) {
      if (e instanceof Error && /not connected/i.test(e.message)) {
        return NextResponse.json(
          {
            error: 'ig_account_not_owned',
            message: 'This Instagram account is not connected to your user.',
          },
          { status: 403 },
        );
      }
      throw e;
    }

    if (profile.sampleSize < MIN_SAMPLE_SIZE) {
      return NextResponse.json(
        {
          error: 'not_enough_data',
          message: `We need at least ${MIN_SAMPLE_SIZE} recent posts on this account before god-mode can design one. Post a few more and try again.`,
        },
        { status: 422 },
      );
    }

    const raw = await cerebrasChatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(profile, likeOfMediaId) },
      ],
      { temperature: LLM_TEMP, maxTokens: LLM_MAX_TOKENS },
    );

    const origin = req.nextUrl.origin;
    const cookie = req.headers.get('cookie') ?? '';

    const parsed = parseLlmJson(raw);
    if (!parsed.ok) {
      return generateFallback({ brandId, userId, origin, cookie, profile, reason: 'parse_failed', raw, igUserId, learningIds: cleanLearningIds });
    }

    const llmSeed = parsed.data as { overrides?: unknown; rationale?: unknown };
    const sanitized = sanitizeMetaOverrides(llmSeed.overrides);
    if (!sanitized || Object.keys(sanitized).length === 0) {
      return generateFallback({ brandId, userId, origin, cookie, profile, reason: 'empty_overrides', raw, igUserId, learningIds: cleanLearningIds });
    }

    // Empty rationale is non-fatal — caller can still see contributions and
    // deepProfile in WhyThisWorks. Only fall back when the seed itself is bad.
    const rationale =
      typeof llmSeed.rationale === 'string' ? llmSeed.rationale.trim() : '';

    const outcome = await generateFromSeed({
      brandId,
      metaOverrides: sanitized,
      userId,
      origin,
      cookie,
      igUserId,
      learningIds: cleanLearningIds,
    });

    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.err.error, message: outcome.err.message },
        { status: outcome.err.status },
      );
    }

    return NextResponse.json({
      ...outcome.data,
      godModeRationale: rationale,
      deepProfile: profile,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[SmartPosts/god-mode] Error:', error);
    return NextResponse.json(
      {
        error: 'god_mode_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
