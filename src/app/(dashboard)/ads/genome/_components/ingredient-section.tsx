'use client';

export interface IngredientRow {
  value: string;
  n: number;
  meanReward: number | null;
  shrunkScore: number | null;
  borrowed: boolean;
  confident: boolean;
}

export interface IngredientDimension {
  dimension: string;
  ingredients: IngredientRow[];
}

// The genome dimensions are internal vocabulary keys. Marketers read these.
const DIMENSION_LABELS: Record<string, string> = {
  angle: 'Creative angle',
  framework: 'Caption structure',
  pain_point: 'Problem it speaks to',
  hook_shape: 'Hook shape',
  cta_type: 'What it asks people to do',
  image_style: 'Image style',
};

function labelFor(dimension: string): string {
  return DIMENSION_LABELS[dimension] ?? dimension.replace(/_/g, ' ');
}

function humanValue(value: string): string {
  return value.replace(/_/g, ' ');
}

/**
 * Bar width as a share of the best score in the same dimension. Relative
 * position is the only honest reading of a shrunk score: the raw 0.023 was
 * meaningless on its own and is what made this table unreadable.
 */
function barWidth(score: number | null, best: number): number {
  if (score === null || best <= 0) return 0;
  return Math.max(2, Math.round((score / best) * 100));
}

function DimensionBlock({ block }: { block: IngredientDimension }) {
  const scored = block.ingredients.filter((i) => i.n > 0);
  if (scored.length === 0) return null;

  const best = Math.max(...scored.map((i) => i.shrunkScore ?? 0));

  return (
    <div className="overflow-hidden rounded-xl border border-(--line) bg-(--surface)">
      <div className="border-b border-(--line) px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-(--muted)">
        {labelFor(block.dimension)}
      </div>
      {scored.map((i) => (
        <div
          key={i.value}
          className="flex flex-wrap items-center gap-3 border-b border-(--line) px-4 py-2.5 text-sm last:border-0"
        >
          <span className="min-w-[150px] flex-1 font-medium text-(--txt)">
            {humanValue(i.value)}
          </span>
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-(--surface-2)">
            <div
              className="h-full rounded-full bg-(--violet)"
              style={{ width: `${barWidth(i.shrunkScore, best)}%` }}
            />
          </div>
          <span className="min-w-[70px] text-xs text-(--muted)">
            {i.n} {i.n === 1 ? 'use' : 'uses'}
          </span>
          <span className="min-w-[190px] text-xs text-(--muted)">
            {!i.confident && 'Too few to trust yet'}
            {i.confident && i.borrowed && 'Estimated from your Instagram posts'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function IngredientSection({
  dimensions,
  loading,
  error,
}: {
  dimensions: IngredientDimension[];
  loading: boolean;
  error?: boolean;
}) {
  // The old banner keyed off `dimensions.length === 0`, which with a seeded
  // vocabulary is normally unreachable: the API returns every dimension that
  // has at least one active ingredient. What is actually empty is the
  // OBSERVATIONS, so that is what this checks. Length CAN still be zero when
  // the request fails, which is why `error` is handled separately below rather
  // than folded into the empty state.
  const hasObservations = dimensions.some((d) => d.ingredients.some((i) => i.n > 0));

  return (
    <details className="group rounded-2xl border border-(--line) bg-(--surface)">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-(--muted) hover:text-(--txt)">
        What&rsquo;s inside the winners
        <span className="ml-2 text-xs text-(--muted)">
          (early, building up over the next few weeks)
        </span>
      </summary>
      <div className="space-y-3 p-4 pt-0">
        {loading && <p className="text-sm text-(--muted)">Loading…</p>}

        {!loading && error && (
          <p className="text-sm text-rose-400">
            Could not load what is inside your winners. Refresh the page to try
            again.
          </p>
        )}

        {!loading && !error && !hasObservations && (
          <p className="text-sm text-(--muted)">
            Nothing recorded yet. Every post published from now on records which
            ingredients it used, and after a few weeks this shows which ones earn
            the most attention.
          </p>
        )}

        {!loading &&
          !error &&
          hasObservations &&
          dimensions.map((d) => <DimensionBlock key={d.dimension} block={d} />)}
      </div>
    </details>
  );
}
