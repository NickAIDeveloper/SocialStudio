// src/app/api/analyze/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { runAnalysis } from '@/lib/analyze/run-analysis';
import type { AnalysisDeps } from '@/lib/analyze/types';
import type { InsightCard } from '@/lib/health-score';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export const maxDuration = 60;

function buildDeps(origin: string, cookie: string): AnalysisDeps {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${origin}${path}`, { headers: { cookie } });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  };
  const post = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { cookie },
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    fetchAnalyticsInsights: (brandId) =>
      post<{
        insights: InsightCard[];
        healthScore: number | null;
        summary: string | null;
      }>(
        `/api/insights?type=analytics${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}`,
      ),
    fetchCompetitorInsights: () =>
      post<{ insights: InsightCard[] }>(`/api/insights?type=competitors`),
    fetchDeepProfile: (igUserId) =>
      get<DeepProfile>(`/api/meta/deep-profile?igUserId=${encodeURIComponent(igUserId)}`),
    fetchHealthDelta: (brandId) =>
      get<{ current: number | null; previous: number | null; delta: number | null }>(
        `/api/smart-posts/history${brandId ? `?brandId=${encodeURIComponent(brandId)}` : ''}`,
      ),
  };
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    let body: { brandId?: string | null; igUserId?: string | null } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine — treat as no filter
    }
    const brandId = typeof body.brandId === 'string' && body.brandId ? body.brandId : null;
    const igUserId = typeof body.igUserId === 'string' && body.igUserId ? body.igUserId : null;
    const origin = req.nextUrl?.origin ?? new URL(req.url).origin;
    const cookie = req.headers.get('cookie') ?? '';

    const result = await runAnalysis(
      { userId, brandId, igUserId, origin, cookie },
      buildDeps(origin, cookie),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Analyze/run] Error:', error);
    return NextResponse.json(
      { error: 'analysis_failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 },
    );
  }
}
