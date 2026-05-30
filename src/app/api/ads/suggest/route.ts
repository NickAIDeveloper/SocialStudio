import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brands } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { cerebrasChatCompletion, isCerebrasAvailable } from '@/lib/cerebras';
import { readBrandBrain } from '@/lib/brain/consume';
import { OBJECTIVE_CONFIG, HEADLINE_MAX, type AdObjective } from '@/lib/meta/ads-types';
import { sanitizeCaption, sanitizeHook, sanitizeHashtags } from '@/lib/caption-engine';

export const maxDuration = 30;

type SuggestField = 'primaryText' | 'hook' | 'headline' | 'hashtags';

const VALID_FIELDS: SuggestField[] = ['primaryText', 'hook', 'headline', 'hashtags'];

function isObjective(v: unknown): v is AdObjective {
  return v === 'TRAFFIC' || v === 'ENGAGEMENT' || v === 'LEADS' || v === 'APP';
}

function isField(v: unknown): v is SuggestField {
  return VALID_FIELDS.includes(v as SuggestField);
}

const SYSTEM_PROMPT =
  'You are an elite direct-response ad copywriter specialising in viral Meta (Facebook/Instagram) ads. ' +
  'You write copy that stops the scroll and drives action. ' +
  'CRITICAL: You NEVER fabricate statistics, study results, or percentages. ' +
  'You NEVER claim "research shows X%" unless it is widely known common knowledge. ' +
  'You use relatable truths, not fake science. ' +
  'Return ONLY a JSON object — no other text, no markdown fences.';

function buildFieldPrompt(args: {
  field: SuggestField;
  brandName: string;
  brandHandle: string;
  brandDescription: string;
  briefMd: string | null;
  objectiveLabel: string;
  objectiveDescription: string;
  destinationUrl: string | undefined;
  current: string | undefined;
}): string {
  const {
    field, brandName, brandHandle, brandDescription,
    briefMd, objectiveLabel, objectiveDescription,
    destinationUrl, current,
  } = args;

  const brandBlock = [
    `BRAND: ${brandName}${brandHandle ? ` (${brandHandle})` : ''}`,
    brandDescription ? `DESCRIPTION: ${brandDescription}` : '',
    briefMd ? `BRAND BRAIN:\n${briefMd.slice(0, 3000)}` : '',
    `OBJECTIVE: ${objectiveLabel} — ${objectiveDescription}`,
    destinationUrl ? `DESTINATION URL: ${destinationUrl}` : '',
    current ? `CURRENT VALUE (user wants alternatives to): "${current}"` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const returnInstruction =
    'Return ONLY JSON: {"options":["...","...","..."]}. No fabricated statistics or fake claims.';

  const fieldInstructions: Record<SuggestField, string> = {
    hook:
      'Write 3 scroll-stopping ad hooks, 3-6 words each. ' +
      'Use curiosity gaps, bold contrarian claims, or pattern interrupts. ' +
      'No fluff, no brand name unless it IS the hook. ' +
      'Each must make someone STOP scrolling.',

    headline:
      `Write 3 ad headlines, MAX ${HEADLINE_MAX} characters each. ` +
      'Punchy, benefit-driven, power words. ' +
      'These appear under the image on the ad.',

    primaryText:
      'Write 3 short ad primary-text options (2-4 short paragraphs each, blank-line separated). ' +
      'Use PAS (Pain-Agitate-Solution) or AIDA. ' +
      'Open with a hook line, end with a CTA that fits the objective. ' +
      'No fabricated stats. No dashes/hyphens. No emojis.',

    hashtags:
      'Write 3 hashtag SETS, each exactly 5 hashtags space-separated. ' +
      'Mix tier-1 broad, tier-2 niche, tier-3 specific. ' +
      'Relevant to the brand + topic.',
  };

  return `${brandBlock}\n\n${fieldInstructions[field]}\n\n${returnInstruction}`;
}

function capAtWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const idx = text.lastIndexOf(' ', max);
  return idx > 0 ? text.slice(0, idx) : text.slice(0, max);
}

function sanitizeOption(option: string, field: SuggestField): string {
  const raw = option.trim();
  switch (field) {
    case 'hook':
      return sanitizeHook(raw);
    case 'headline': {
      const cleaned = sanitizeHook(raw);
      return capAtWordBoundary(cleaned, HEADLINE_MAX);
    }
    case 'primaryText':
      return sanitizeCaption(raw);
    case 'hashtags':
      // sanitizeHashtags joins tags with "\n" (autopilot/captions rely on that
      // form). For ad suggestion display we want a single space-separated line.
      return sanitizeHashtags(raw).replace(/\n+/g, ' ').trim();
    default:
      return raw;
  }
}

function parseOptions(raw: string): string[] {
  // Strip markdown fences, then find the JSON object.
  const stripped = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    const repairs = [
      jsonMatch[0],
      jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
    ];
    for (const attempt of repairs) {
      try {
        const parsed = JSON.parse(attempt) as { options?: unknown };
        if (Array.isArray(parsed.options)) {
          return (parsed.options as unknown[])
            .map((o) => String(o).trim())
            .filter(Boolean);
        }
      } catch { /* try next repair */ }
    }
  }

  // Line-based fallback: split on newlines, drop empty lines.
  return stripped
    .split('\n')
    .map((l) => l.replace(/^[\d]+\.\s*/, '').replace(/^["'\-]+/, '').trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();

    const body = (await request.json()) as {
      brandId?: string;
      objective?: string;
      field?: string;
      destinationUrl?: string;
      current?: string;
    };

    // Validate brandId
    if (!body.brandId) {
      return NextResponse.json({ error: 'brandId_required' }, { status: 400 });
    }

    // Validate field
    if (!isField(body.field)) {
      return NextResponse.json({ error: 'invalid_field', message: `field must be one of: ${VALID_FIELDS.join(', ')}` }, { status: 400 });
    }

    // Validate objective
    if (!isObjective(body.objective)) {
      return NextResponse.json({ error: 'invalid_objective' }, { status: 400 });
    }

    // Check AI availability before hitting the DB
    if (!isCerebrasAvailable()) {
      return NextResponse.json({ error: 'no_ai_key', message: 'AI not configured' }, { status: 503 });
    }

    // Ownership check
    const [brand] = await db
      .select()
      .from(brands)
      .where(and(eq(brands.id, body.brandId), eq(brands.userId, userId)))
      .limit(1);

    if (!brand) {
      return NextResponse.json({ error: 'brand_not_found' }, { status: 403 });
    }

    const brain = await readBrandBrain(body.brandId).catch(() => null);
    const cfg = OBJECTIVE_CONFIG[body.objective];

    const prompt = buildFieldPrompt({
      field: body.field,
      brandName: brand.name ?? brand.slug,
      brandHandle: brand.instagramHandle ? `@${brand.instagramHandle}` : '',
      brandDescription: brand.description ?? '',
      briefMd: brain?.briefMd ?? null,
      objectiveLabel: cfg.label,
      objectiveDescription: cfg.description,
      destinationUrl: body.destinationUrl,
      current: body.current,
    });

    let rawContent: string;
    try {
      rawContent = await cerebrasChatCompletion(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.9, maxTokens: 400 },
      );
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isRateLimit = /\((429|503)\)/.test(msg) || /rate.?limit/i.test(msg);
      return NextResponse.json(
        {
          error: 'suggest_failed',
          message: isRateLimit
            ? 'AI provider is rate-limited right now. Try again in a minute.'
            : msg.slice(0, 200),
        },
        { status: 502 },
      );
    }

    const rawOptions = parseOptions(rawContent);

    // Sanitize, de-dupe, keep up to 3 non-empty
    const seen = new Set<string>();
    const options: string[] = [];
    for (const raw of rawOptions) {
      const sanitized = sanitizeOption(raw, body.field);
      if (!sanitized || seen.has(sanitized)) continue;
      seen.add(sanitized);
      options.push(sanitized);
      if (options.length === 3) break;
    }

    return NextResponse.json({ success: true, options });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[ads/suggest] Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const isRateLimit = /\((429|503)\)/.test(msg) || /rate.?limit/i.test(msg);
    return NextResponse.json(
      {
        error: 'suggest_failed',
        message: isRateLimit
          ? 'AI provider is rate-limited right now. Try again in a minute.'
          : msg.slice(0, 200),
      },
      { status: 502 },
    );
  }
}
