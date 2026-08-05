'use client';

import { useEffect, useState } from 'react';
import { PostRow } from './_components/post-row';
import { AdRow } from './_components/ad-row';
import {
  IngredientSection,
  type IngredientDimension,
} from './_components/ingredient-section';
import type { LeaderboardRow } from '@/lib/leaderboard/organic';
import type { LeaderboardAdRow } from '@/lib/leaderboard/ads';

type Surface = 'organic' | 'ads';

// Discriminated on `surface`, which the ROUTE reports. Branching on the
// requested surface instead would read the request state while `rows` still
// held the previous surface's response.
type LeaderboardPayload = { totalAnalysed: number; verdict: string | null } & (
  | { surface: 'organic'; rows: LeaderboardRow[] }
  | { surface: 'ads'; rows: LeaderboardAdRow[] }
);

const emptyFor = (surface: Surface): LeaderboardPayload =>
  surface === 'organic'
    ? { surface: 'organic', rows: [], totalAnalysed: 0, verdict: null }
    : { surface: 'ads', rows: [], totalAnalysed: 0, verdict: null };

export default function LeaderboardPage() {
  const [surface, setSurface] = useState<Surface>('organic');
  const [board, setBoard] = useState<LeaderboardPayload>(() => emptyFor('organic'));
  const [dimensions, setDimensions] = useState<IngredientDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [ingredientsLoading, setIngredientsLoading] = useState(true);
  const [ingredientsError, setIngredientsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/creative/leaderboard?surface=${surface}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LeaderboardPayload;
        if (!cancelled) setBoard({ ...emptyFor(surface), ...json });
      } catch {
        if (!cancelled) {
          setBoard(emptyFor(surface));
          setError('Could not load the leaderboard. Refresh the page to try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [surface]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIngredientsLoading(true);
      setIngredientsError(false);
      try {
        const res = await fetch(`/api/creative/genome?surface=${surface}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { dimensions?: IngredientDimension[] };
        if (!cancelled) setDimensions(json.dimensions ?? []);
      } catch {
        if (!cancelled) {
          setDimensions([]);
          setIngredientsError(true);
        }
      } finally {
        if (!cancelled) setIngredientsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [surface]);

  // Read from the RESPONSE, not the requested surface.
  const isOrganic = board.surface === 'organic';
  const hasRows = board.rows.length > 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-(--txt)">Leaderboard</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Your posts and ads ranked by how many people they actually reached, best
          first. Make more like the ones at the top.
        </p>
      </div>

      <div className="flex gap-2">
        {(['organic', 'ads'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSurface(s)}
            className={`rounded-full border px-3 py-1 text-xs ${
              surface === s
                ? 'border-(--violet-24) bg-(--violet-08) text-(--violet-bright)'
                : 'border-(--line-strong) text-(--muted)'
            }`}
          >
            {s === 'organic' ? 'Instagram posts' : 'Ads'}
          </button>
        ))}
      </div>

      {board.verdict && !loading && (
        <div className="rounded-2xl border border-(--violet-24) bg-gradient-to-br from-(--violet-12) to-(--surface) p-5">
          <p className="text-base text-(--txt)">{board.verdict}</p>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-(--line) bg-(--surface) p-5 text-sm text-rose-400">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-(--muted)">Loading…</p>}

      {!loading && !error && !hasRows && (
        <p className="rounded-2xl border border-(--line) bg-(--surface) p-5 text-sm text-(--muted)">
          {isOrganic
            ? 'No posts have been measured yet. Once a published post has been live long enough for Instagram to report its reach, it ranks here.'
            : 'Your ads have not reached anyone yet, so there is nothing to rank. Once an ad is live and delivering, it appears here ordered by cost per result.'}
        </p>
      )}

      {!loading && hasRows && (
        <div className="overflow-hidden rounded-2xl border border-(--line) bg-(--surface)">
          {board.surface === 'organic'
            ? board.rows.map((r) => <PostRow key={r.postId} row={r} />)
            : board.rows.map((r) => <AdRow key={r.adId} row={r} />)}
        </div>
      )}

      {!loading && hasRows && board.totalAnalysed > board.rows.length && (
        <p className="text-xs text-(--muted)">
          Showing the top {board.rows.length} of {board.totalAnalysed} measured.
        </p>
      )}

      <IngredientSection
        dimensions={dimensions}
        loading={ingredientsLoading}
        error={ingredientsError}
      />
    </div>
  );
}
