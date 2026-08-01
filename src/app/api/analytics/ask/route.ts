// POST /api/analytics/ask   { "query": "why did pacebrain reach drop" }
// GET  /api/analytics/ask   → the list of answerable questions
//
// Conversational analytics without letting a model near the database. The query
// string only ever selects WHICH hand-written, read-only query runs; it never
// becomes part of one. See lib/analytics/questions.ts for why.
//
// Session-authenticated and scoped to the caller's own brands.

import { NextResponse } from 'next/server';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands, posts, postAnalytics, autopilotSettings, metaAds, brandPainPoints, creativeGenerations,
} from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { matchQuestion, listQuestions } from '@/lib/analytics/questions';
import { aggregateByDimension, type StatRow } from '@/lib/brain/creative-stats';
import type { RankedPain } from '@/lib/research/pain-points';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });
  return NextResponse.json({ questions: listQuestions() });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const { query } = (await req.json().catch(() => ({}))) as { query?: string };
  const question = matchQuestion(query ?? '');
  if (!question) {
    // Say so rather than answering a different question convincingly.
    return NextResponse.json({
      answered: false,
      message: "I can't answer that one yet.",
      canAnswer: listQuestions(),
    });
  }

  const owned = await db.select().from(brands).where(eq(brands.userId, userId));
  const brandIds = owned.map(b => b.id);
  if (brandIds.length === 0) return NextResponse.json({ answered: true, question: question.id, rows: [] });

  const rows: Array<Record<string, unknown>> = [];

  for (const brand of owned) {
    switch (question.id) {
      case 'reach_trend': {
        const recent = await db
          .select({ reach: postAnalytics.reach, views: postAnalytics.views, at: posts.scheduledAt })
          .from(postAnalytics)
          .innerJoin(posts, eq(posts.id, postAnalytics.postId))
          .where(eq(posts.brandId, brand.id))
          .orderBy(desc(posts.scheduledAt))
          .limit(10);
        if (recent.length === 0) break;
        const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
        const reaches = recent.map(r => r.reach ?? 0);
        rows.push({
          brand: brand.slug,
          posts: recent.length,
          avgReach: Math.round(avg(reaches)),
          avgViews: Math.round(avg(recent.map(r => r.views ?? 0))),
          latest: reaches[0] ?? 0,
          previousAverage: Math.round(avg(reaches.slice(1))),
        });
        break;
      }
      case 'top_hook_patterns': {
        const gens = await db
          .select({
            hookPattern: creativeGenerations.hookPattern,
            angle: creativeGenerations.angle,
            reach: postAnalytics.reach,
            saves: postAnalytics.saves,
          })
          .from(creativeGenerations)
          .leftJoin(posts, eq(posts.id, creativeGenerations.postId))
          .leftJoin(postAnalytics, eq(postAnalytics.postId, posts.id))
          .where(eq(creativeGenerations.brandId, brand.id));
        const stats = aggregateByDimension(gens as StatRow[], 'hookPattern');
        if (stats.length > 0) {
          rows.push({ brand: brand.slug, byHookShape: stats.slice(0, 5) });
        }
        break;
      }
      case 'failed_posts': {
        const failed = await db
          .select({ at: posts.scheduledAt, reason: posts.failureReason, hook: posts.hookText })
          .from(posts)
          .where(and(eq(posts.brandId, brand.id), eq(posts.status, 'failed')))
          .orderBy(desc(posts.scheduledAt))
          .limit(10);
        if (failed.length > 0) rows.push({ brand: brand.slug, failed });
        break;
      }
      case 'ad_spend': {
        const ads = await db
          .select({ adId: metaAds.adId, status: metaAds.status, objective: metaAds.objective, createdBy: metaAds.createdBy })
          .from(metaAds)
          .where(eq(metaAds.brandId, brand.id));
        if (ads.length > 0) {
          rows.push({
            brand: brand.slug,
            totalAds: ads.length,
            active: ads.filter(a => a.status === 'ACTIVE').length,
            paused: ads.filter(a => a.status === 'PAUSED').length,
            failed: ads.filter(a => a.status === 'FAILED').length,
            note: 'Spend appears once an ad has delivered; none have yet.',
          });
        }
        break;
      }
      case 'pain_points': {
        const [row] = await db
          .select()
          .from(brandPainPoints)
          .where(eq(brandPainPoints.brandId, brand.id));
        const ranked = (row?.ranked as RankedPain[] | null) ?? [];
        if (ranked.length > 0) {
          rows.push({
            brand: brand.slug,
            researchedAt: row?.fetchedAt,
            trusted: ranked.filter(p => p.trusted).map(p => ({ theme: p.theme, mentions: p.mentions, quote: p.topQuote })),
            alsoSeen: ranked.filter(p => !p.trusted).slice(0, 5).map(p => p.theme),
          });
        }
        break;
      }
      case 'posting_cadence': {
        const [settings] = await db
          .select()
          .from(autopilotSettings)
          .where(eq(autopilotSettings.brandId, brand.id));
        const published = await db
          .select({ id: posts.id })
          .from(posts)
          .where(and(eq(posts.brandId, brand.id), isNotNull(posts.publishedAt)));
        if (settings) {
          rows.push({
            brand: brand.slug,
            enabled: settings.enabled,
            frequency: settings.frequency,
            mediaFormat: settings.mediaFormat,
            published: published.length,
            lastRunAt: settings.lastRunAt,
            nextRunAt: settings.nextRunAt,
            lastError: settings.lastError,
          });
        }
        break;
      }
    }
  }

  return NextResponse.json({ answered: true, question: question.id, label: question.label, rows });
}
