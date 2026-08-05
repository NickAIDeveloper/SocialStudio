import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { verifyBrainSignature } from '@/lib/brain/auth';
import { generateFromSeed, sanitizeMetaOverrides } from '@/lib/smart-posts/generate';
import { buildDeepProfile } from '@/lib/meta/deep-profile';
import { buildCompetitorIntel, type CompetitorIntel } from '@/lib/brain/competitor-intel';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';
import { FORMAT_OPTIONS_JSON, SUPPORTED_FORMATS, isSupportedFormat } from '@/lib/autopilot/capabilities';
import { isIgAuthError } from '@/lib/meta/ig-token';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brandPainPoints, posts } from '@/lib/db/schema';
import { buildPainBrief, type RankedPain } from '@/lib/research/pain-points';
import { buildAutopilotSteering, type AutopilotSteering } from '@/lib/smart-posts/autopilot-steering';
import { RECORD_ONLY_DIMENSIONS } from '@/lib/creative/vocabulary';
import type { SampledGenome } from '@/lib/creative/sampling';
import type { HookPattern } from '@/lib/brain/creative-stats';
import { TARGETABLE_PATTERNS } from '@/lib/brain/hook-shape';

// Allow longer runtime — deep profile fetch + LLM design + image compositing.
// Bumped from 60s to 90s after Cerebras rate-limit retries (300ms base, up to
// 3 attempts per call, 3-4 calls per generation) pushed total work past the
// previous 60s ceiling and produced FUNCTION_INVOCATION_TIMEOUT.
export const maxDuration = 90;

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
  cronSecret?: string;
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
    cronSecret: opts.cronSecret,
    igUserId: opts.igUserId,
    learningIds: opts.learningIds,
    // The pipeline only ships single photos. Pass the IMAGE format even on the
    // fallback path so caption-framework rotation still runs — without this the
    // fallback silently defaulted to 'quote' every time, reinforcing the
    // contrarian-one-liner collapse.
    metaOverrides: { format: 'IMAGE' },
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

// The hook shape this genome chose, when it chose one this repo can steer to.
//
// The vocabulary's hook_shape values are deliberately the same five strings
// classifyHookPattern() emits, so genomes and measured shapes compare directly.
// But the vocabulary is DATA in a table and can grow without a code change, so
// an unrecognised value degrades to letting pickUnderusedPattern decide rather
// than naming a shape SHAPE_GUIDE has no wording for.
export function genomeHookShape(genome: SampledGenome | null | undefined): HookPattern | null {
  const found = genome?.ingredients.find(i => i.dimension === 'hook_shape');
  if (!found) return null;
  return TARGETABLE_PATTERNS.includes(found.value as HookPattern)
    ? (found.value as HookPattern)
    : null;
}

// The prompt text for a sampled genome. Exported so the selection rules can be
// tested without calling a model. Mirrors buildGenomeBlock in lib/ads/ad-copy.ts
// — same vocabulary, same skip rules, different surface.
//
// Two kinds of ingredient are dropped:
//   - RECORD_ONLY_DIMENSIONS (image_style today): stored and scored so history
//     exists when generated imagery lands, but no image path can act on it yet,
//     and describing a picture nobody is choosing is pure noise.
//   - hook_shape, when `hookShapeSpokenElsewhere` is true. The steering block
//     already names it as the single HOOK SHAPE FOR THIS POST, with the
//     overuse context attached. Repeating the bare fragment would add a
//     second, weaker voice saying the same thing.
export function buildGodModeGenomeBlock(
  genome: SampledGenome | null | undefined,
  opts: { hookShapeSpokenElsewhere: boolean },
): string {
  if (!genome || genome.ingredients.length === 0) return '';
  const steerable = genome.ingredients.filter(
    i =>
      !RECORD_ONLY_DIMENSIONS.includes(i.dimension) &&
      !(opts.hookShapeSpokenElsewhere && i.dimension === 'hook_shape'),
  );
  if (steerable.length === 0) return '';
  return [
    'CREATIVE DIRECTION FOR THIS POST (follow all of it):',
    ...steerable.map(i => `- ${i.promptFragment}`),
    'Use the direction above INTERNALLY as structure only. Never print framework names or stage labels.',
  ].join('\n');
}

function buildUserPrompt(
  profile: DeepProfile,
  competitorIntel: CompetitorIntel | null,
  likeOfMediaId?: string,
  steering?: AutopilotSteering | null,
  genomeBlock?: string,
): string {
  const compact = compactProfileForPrompt(profile);
  const likeOfLine = likeOfMediaId
    ? `The user wants this new post to be similar in style and angle to their existing top performer with media id ${likeOfMediaId}. Use that post's apparent format and topic as the anchor, not the account medians.\n\n`
    : '';
  const competitorBlock =
    competitorIntel && competitorIntel.sampleSize > 0
      ? [
          '',
          `COMPETITOR_INTEL_JSON (${competitorIntel.sampleSize} posts across ${competitorIntel.competitorCount} competitors, ranked by engagement):`,
          JSON.stringify(competitorIntel, null, 2),
          '',
          'Use COMPETITOR_INTEL_JSON to spot patterns that win in this niche but the account is not yet using. If a competitor hook pattern (question/stat/imperative) or media type beats the account medians, lean toward it. Borrow the angle — never copy a hook verbatim. If a competitor hashtag has high engagement and is not branded to them, it is a candidate keyword for the caption.',
        ].join('\n')
      : '';
  const capabilityNote =
    SUPPORTED_FORMATS.length === 1
      ? `IMPORTANT CAPABILITY CONSTRAINT: this account can only ship single-photo posts right now. Reels and carousels are not yet supported by the pipeline. You MUST set "format" to "${SUPPORTED_FORMATS[0]}". Even if the data suggests reels or carousels would beat the account medians, design the strongest possible single-photo post (still-image hook with overlay) — do not pick REEL or CAROUSEL.`
      : `Pick one of the supported formats: ${FORMAT_OPTIONS_JSON}. Other formats are not yet shippable.`;
  // Audience pain and hook-shape variety. Both were wired into /api/captions
  // only, so the unattended posting path generated without either.
  const steeringBlock = steering && steering.blocks.length > 0
    ? `\n${steering.blocks.join('\n\n')}\n\nThe "pattern" you return MUST follow the hook shape above.\n`
    : '';
  // Empty string when the genome is off or contributed nothing steerable, which
  // keeps the joined prompt byte-identical to the pre-genome build.
  const genomeSection = genomeBlock ? `\n${genomeBlock}\n` : '';

  return [
    "Below is the account's full performance profile. Use the actual numbers.",
    '',
    'PROFILE_JSON:',
    JSON.stringify(compact, null, 2),
    competitorBlock,
    // Concatenated into ONE array element rather than appended as a second one:
    // an extra element would add an extra newline to the join even when empty,
    // so the flag-off prompt would no longer be byte-identical to today's.
    steeringBlock + genomeSection,
    '',
    capabilityNote,
    '',
    likeOfLine + 'Design ONE Instagram post that has the best chance of beating this account\'s median reach AND outperforming what competitors are shipping in this niche.',
    'Reply with this exact JSON shape, and nothing else:',
    '{',
    '  "overrides": {',
    `    "format": ${FORMAT_OPTIONS_JSON},`,
    '    "day": "Monday".."Sunday",',
    '    "hour": 0-23,',
    '    "pattern": "<short caption hook pattern, max 60 chars>",',
    '    "preset": "<short topic or angle seed, max 200 chars>"',
    '  },',
    '  "rationale": "<4 to 6 plain English sentences. Cite specific numbers from PROFILE_JSON AND, when relevant, from COMPETITOR_INTEL_JSON, e.g. \'Carousels reach 2.3x your median and competitors get 4.1k avg engagement on stat-led hooks vs your 800\'>"',
    '}',
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    // Read body as text once so we can verify HMAC and parse JSON from same bytes.
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch (err) {
      console.warn('[SmartPosts/god-mode] failed to read body:', err);
      return NextResponse.json(
        { error: 'invalid_body', message: 'Could not read request body.' },
        { status: 400 },
      );
    }

    // HMAC path: server-to-server calls (e.g. autopilot) sign the body with
    // BRAIN_CRON_SECRET and supply userId in the body — no cookie/session needed.
    // Session path: normal browser UI calls authenticated via NextAuth cookie.
    let userId: string;
    const hasSig = Boolean(req.headers.get('x-brain-signature'));
    if (hasSig) {
      const ok = await verifyBrainSignature(req, rawBody);
      if (!ok) {
        return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
      }
      let parsedForUserId: { userId?: string } = {};
      try {
        parsedForUserId = JSON.parse(rawBody) as { userId?: string };
      } catch {
        return NextResponse.json(
          { error: 'invalid_json', message: 'Request body must be valid JSON.' },
          { status: 400 },
        );
      }
      if (!parsedForUserId.userId) {
        return NextResponse.json(
          { error: 'userId_required', message: 'userId required in body for HMAC-authenticated requests.' },
          { status: 400 },
        );
      }
      userId = parsedForUserId.userId;
    } else {
      userId = await getUserId();
    }

    let body: { brandId?: string; igUserId?: string; likeOfMediaId?: string; learningIds?: string[]; userId?: string; metaOverrides?: unknown };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch (err) {
      console.warn('[SmartPosts/god-mode] invalid JSON body:', err);
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body must be valid JSON.' },
        { status: 400 },
      );
    }
    const { brandId, igUserId, likeOfMediaId, learningIds } = body;
    // metaOverrides may be passed by autopilot to seed format/timing from brain formula.
    const callerMetaOverrides = body.metaOverrides ?? null;
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
      // Expired/invalid IG token: return a distinct, actionable code instead of
      // a cryptic god_mode_500 so the autopilot dashboard says "reconnect IG"
      // rather than looking like a model outage. The proactive refresh in
      // getFreshIgToken normally prevents this; this only fires if the token
      // died while the cron was down (e.g. billing lock) past the refresh window.
      if (isIgAuthError(e)) {
        return NextResponse.json(
          {
            error: 'ig_token_expired',
            message:
              'Instagram session expired. Reconnect Instagram in Settings to resume autopilot.',
          },
          { status: 422 },
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

    // Competitor intel is best-effort — a failure here must never block design.
    // Returns an empty-sample shape when the brand has no scraped competitors yet.
    let competitorIntel: CompetitorIntel | null = null;
    try {
      competitorIntel = await buildCompetitorIntel(brandId);
    } catch (err) {
      console.warn('[SmartPosts/god-mode] buildCompetitorIntel failed:', err instanceof Error ? err.message : err);
    }

    // Creative genome: choose the ingredients for this post from what has
    // actually earned reach on this surface. Flagged off by default and fully
    // best-effort — the house pattern from ads/generate/route.ts. A genome
    // failure must never block a post, exactly as a brain failure never blocks
    // a caption. This is the unattended rail: undefined here means the whole
    // route behaves exactly as it did before the genome existed.
    let genome: SampledGenome | undefined;
    if (process.env.CREATIVE_GENOME_ENABLED === 'true') {
      try {
        const [{ sampleGenome }, read] = await Promise.all([
          import('@/lib/creative/sampling'),
          import('@/lib/creative/genome-read'),
        ]);
        const [available, scores, recent, index] = await Promise.all([
          read.loadSamplableIngredients(),
          read.refreshScores(),
          read.loadRecentGenomeIngredientIds('organic', 10),
          read.nextGenomeIndex('organic'),
        ]);
        genome = sampleGenome({
          available,
          scores,
          surface: 'organic',
          recentGenomes: recent,
          index,
        });
      } catch (err) {
        console.warn('[SmartPosts/god-mode] genome sampling failed:', err instanceof Error ? err.message : err);
        genome = undefined;
      }
    }

    // Whichever shape the genome picked becomes the steering target, replacing
    // pickUnderusedPattern's. See SteeringInput.targetPattern for why only one
    // of the two may speak.
    const genomeShape = genomeHookShape(genome);

    // Creative steering: hook-shape variety + audience pain research. Both are
    // best-effort — a brand with no research, or a transient DB error, must
    // degrade to the previous unsteered behaviour rather than block a post.
    let steering: AutopilotSteering | null = null;
    try {
      const [recentRows, painRow] = await Promise.all([
        db
          .select({ hookText: posts.hookText })
          .from(posts)
          .where(eq(posts.brandId, brandId))
          .orderBy(desc(posts.createdAt))
          .limit(15),
        db
          .select()
          .from(brandPainPoints)
          .where(eq(brandPainPoints.brandId, brandId))
          .then(rows => rows[0] ?? null),
      ]);
      steering = buildAutopilotSteering({
        recentHooks: recentRows.map(r => r.hookText ?? ''),
        painBrief: painRow?.ranked ? buildPainBrief(painRow.ranked as RankedPain[]) : null,
        targetPattern: genomeShape,
      });
    } catch (err) {
      console.warn('[SmartPosts/god-mode] steering failed:', err instanceof Error ? err.message : err);
    }

    // Only skip the genome's own hook_shape fragment when the steering block
    // actually survived to say it. If steering threw, the genome is the only
    // voice left and must keep its shape.
    const genomeBlock = buildGodModeGenomeBlock(genome, {
      hookShapeSpokenElsewhere: steering !== null && genomeShape !== null,
    });

    const raw = await cerebrasChatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(profile, competitorIntel, likeOfMediaId, steering, genomeBlock) },
      ],
      { temperature: LLM_TEMP, maxTokens: LLM_MAX_TOKENS },
    );

    const origin = req.nextUrl.origin;
    const cookie = req.headers.get('cookie') ?? '';
    const cronSecret = hasSig ? (process.env.BRAIN_CRON_SECRET ?? undefined) : undefined;

    const parsed = parseLlmJson(raw);
    if (!parsed.ok) {
      return generateFallback({ brandId, userId, origin, cookie, cronSecret, profile, reason: 'parse_failed', raw, igUserId, learningIds: cleanLearningIds });
    }

    const llmSeed = parsed.data as { overrides?: unknown; rationale?: unknown };
    const sanitized = sanitizeMetaOverrides(llmSeed.overrides);
    if (!sanitized || Object.keys(sanitized).length === 0) {
      return generateFallback({ brandId, userId, origin, cookie, cronSecret, profile, reason: 'empty_overrides', raw, igUserId, learningIds: cleanLearningIds });
    }

    // Capability backstop: even with the prompt constraint, occasionally the
    // LLM still returns an unsupported format. Force it to a supported one so
    // downstream pipeline (single-photo only today) never gets REEL/CAROUSEL.
    if (sanitized.format && !isSupportedFormat(sanitized.format)) {
      sanitized.format = SUPPORTED_FORMATS[0];
    }

    // Empty rationale is non-fatal — caller can still see contributions and
    // deepProfile in WhyThisWorks. Only fall back when the seed itself is bad.
    const rationale =
      typeof llmSeed.rationale === 'string' ? llmSeed.rationale.trim() : '';

    // If the caller supplied metaOverrides (e.g. autopilot brain formula), merge
    // them on top of the LLM-designed seed — caller values take precedence for
    // format and timing, LLM fills pattern/preset.
    const callerSanitized = callerMetaOverrides ? sanitizeMetaOverrides(callerMetaOverrides) : null;
    const mergedOverrides = callerSanitized
      ? { ...sanitized, ...callerSanitized }
      : sanitized;

    const outcome = await generateFromSeed({
      brandId,
      metaOverrides: mergedOverrides,
      userId,
      origin,
      cookie,
      cronSecret,
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
      // Returned so the CALLER can record it against the post row it creates.
      // This route never sees a posts.id, and the genome is only worth keeping
      // once a post exists to attribute its reach to. Plain data, so it
      // survives the HMAC-authenticated JSON hop to /api/autopilot/run intact.
      //
      // Spread conditionally: an undefined value is dropped by JSON.stringify
      // anyway, but being explicit keeps the flag-off response provably
      // key-for-key identical to today's.
      ...(genome ? { genome } : {}),
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
