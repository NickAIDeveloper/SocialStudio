import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { metaAccounts, metaInsightsCache } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/encryption';
import {
  getInsights,
  DEFAULT_INSIGHTS_FIELDS,
  type DatePreset,
  type InsightsLevel,
} from '@/lib/meta/client';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — tune to taste

const VALID_LEVELS: InsightsLevel[] = ['account', 'campaign', 'adset', 'ad'];
const VALID_PRESETS: DatePreset[] = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_30d',
  'last_90d',
  'this_month',
  'last_month',
  'maximum',
];

function parseDatePreset(raw: string | null): DatePreset {
  if (raw && (VALID_PRESETS as string[]).includes(raw)) return raw as DatePreset;
  return 'last_30d';
}
function parseLevel(raw: string | null): InsightsLevel {
  if (raw && (VALID_LEVELS as string[]).includes(raw)) return raw as InsightsLevel;
  return 'account';
}

// GET /api/meta/insights?adAccountId=...&datePreset=last_30d&level=account&breakdowns=age,gender
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();

    const adAccountIdParam = req.nextUrl.searchParams.get('adAccountId');
    const datePreset = parseDatePreset(req.nextUrl.searchParams.get('datePreset'));
    const level = parseLevel(req.nextUrl.searchParams.get('level'));
    const breakdowns = (req.nextUrl.searchParams.get('breakdowns') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const timeIncrementRaw = req.nextUrl.searchParams.get('timeIncrement');
    const timeIncrement = timeIncrementRaw ? Number(timeIncrementRaw) : undefined;

    // Load the user's Meta account — need the ad account + token.
    const [account] = await db
      .select()
      .from(metaAccounts)
      .where(eq(metaAccounts.userId, userId))
      .limit(1);

    if (!account) {
      return NextResponse.json(
        { error: 'Meta account not connected' },
        { status: 400 }
      );
    }

    const adAccountId = adAccountIdParam ?? account.selectedAdAccountId;
    if (!adAccountId) {
      return NextResponse.json(
        { error: 'No ad account selected' },
        { status: 400 }
      );
    }

    // Build a cache key that encodes the query shape.
    const cacheKey = [
      level,
      datePreset,
      breakdowns.join('|') || 'none',
      timeIncrement ?? 'none',
    ].join(':');

    // Check cache
    const [cached] = await db
      .select()
      .from(metaInsightsCache)
      .where(
        and(
          eq(metaInsightsCache.userId, userId),
          eq(metaInsightsCache.adAccountId, adAccountId),
          eq(metaInsightsCache.cacheKey, cacheKey)
        )
      )
      .limit(1);

    if (cached && cached.expiresAt > new Date()) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        cached: true,
        fetchedAt: cached.fetchedAt,
      });
    }

    // When grouping below account level, Meta only surfaces the grouping
    // entity's name/id if we ask for it explicitly in `fields`.
    const levelFields =
      level === 'campaign'
        ? ['campaign_id', 'campaign_name']
        : level === 'adset'
          ? ['adset_id', 'adset_name', 'campaign_id', 'campaign_name']
          : level === 'ad'
            ? ['ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name']
            : [];
    const fields = [...DEFAULT_INSIGHTS_FIELDS, ...levelFields];

    // Cache miss (or stale) — hit Meta
    const accessToken = decrypt(account.accessToken);
    const insights = await getInsights(accessToken, {
      adAccountId,
      level,
      datePreset,
      fields,
      breakdowns: breakdowns.length ? breakdowns : undefined,
      timeIncrement,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    await db
      .insert(metaInsightsCache)
      .values({
        userId,
        adAccountId,
        cacheKey,
        data: insights,
        fetchedAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          metaInsightsCache.userId,
          metaInsightsCache.adAccountId,
          metaInsightsCache.cacheKey,
        ],
        set: { data: insights, fetchedAt: now, expiresAt },
      });

    return NextResponse.json({
      success: true,
      data: insights,
      cached: false,
      fetchedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : 'Failed to load insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
