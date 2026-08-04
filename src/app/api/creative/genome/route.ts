// GET /api/creative/genome?surface=ads|organic
//
// The "what is actually working" view: every ingredient with its sample count,
// raw mean and shrunk score, grouped by dimension.
//
// Read-only by construction. Scores are recomputed on read — a few
// milliseconds at this volume, and one less cron to notice has stopped.

import { NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth-helpers';
import { loadSamplableIngredients, refreshScores } from '@/lib/creative/genome-read';
import { CREATIVE_DIMENSIONS } from '@/lib/creative/vocabulary';
import { MIN_CONFIDENT_SAMPLES } from '@/lib/brain/creative-stats';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: 'unauth' }, { status: 401 });

  const surface = new URL(req.url).searchParams.get('surface') ?? 'ads';
  if (surface !== 'ads' && surface !== 'organic') {
    return NextResponse.json(
      { error: 'unknown_surface', supported: ['ads', 'organic'] },
      { status: 400 },
    );
  }

  const [available, allScores] = await Promise.all([
    loadSamplableIngredients(),
    refreshScores(),
  ]);
  const scoreById = new Map(
    allScores.filter(s => s.surface === surface).map(s => [s.ingredientId, s]),
  );

  const dimensions = CREATIVE_DIMENSIONS.map(dimension => ({
    dimension,
    ingredients: available
      .filter(i => i.dimension === dimension)
      .map(i => {
        const s = scoreById.get(i.id);
        return {
          value: i.value,
          n: s?.n ?? 0,
          meanReward: s?.meanReward ?? null,
          shrunkScore: s?.shrunkScore ?? null,
          borrowed: s?.borrowed ?? false,
          confident: (s?.n ?? 0) >= MIN_CONFIDENT_SAMPLES,
        };
      })
      // Confidence outranks score, for the same reason it does on /ask: a
      // reader scans top-down and acts on what leads, so a one-observation
      // result must never head the list.
      .sort((a, b) => {
        if (a.confident !== b.confident) return a.confident ? -1 : 1;
        return (b.shrunkScore ?? 0) - (a.shrunkScore ?? 0);
      }),
  })).filter(d => d.ingredients.length > 0);

  return NextResponse.json({ surface, dimensions });
}
