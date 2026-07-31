// src/lib/brain/creative-stats.ts
//
// "Creative as data" (M2): learn from the INPUTS that produced a creative, not
// just the artefact. The existing angle→reach loop (creative-angles.ts) does
// this for one attribute; this generalises it to every knob we turn — hook
// shape, image source, overlay style, model — so we can ask which of them
// actually correlate with distribution.
//
// The hard constraint here is SAMPLE SIZE, not maths. The marketed products are
// early (23 users, ~2 signups/month) and autopilot posts a few times a week, so
// every aggregate starts life with n=1 or n=2. An average over two posts is
// noise, and feeding it to the brief as a "finding" would make the system chase
// randomness with total confidence — worse than having no loop at all.
//
// So every result carries its sample count, and rankDimension REFUSES to name a
// winner until both the leader and the runner-up are adequately sampled and
// meaningfully apart. "insufficient_data" is the expected answer for a while,
// and that is the honest one.

// Below this many observations a value's mean is reported but not trusted.
// Deliberately modest: high enough to reject n=1/n=2 noise, low enough to be
// reachable at a few posts a week. Not a statistical test — a guardrail.
export const MIN_CONFIDENT_SAMPLES = 5;

// A leader must beat the runner-up by this fraction to count as a real
// difference rather than jitter.
const MIN_RELATIVE_LIFT = 0.15;

export type HookPattern =
  | 'question'
  | 'number'
  | 'contrarian'
  | 'personal'
  | 'statement'
  | 'unknown';

// Structural shape of a hook, derived from the text so hooks are comparable
// across brands and wordings. Order matters: the checks run strongest-signal
// first, so "3 things you got wrong?" is a question, not a number.
export function classifyHookPattern(hook: string | null | undefined): HookPattern {
  const text = (hook ?? '').trim();
  if (!text) return 'unknown';

  if (text.includes('?')) return 'question';
  if (/^\s*\d+\b/.test(text)) return 'number';
  if (/\b(never|stop|don'?t|no one|nobody|isn'?t|aren'?t|won'?t|forget|myth|wrong)\b/i.test(text)) {
    return 'contrarian';
  }
  if (/\b(i|i'?m|i'?ve|my|me)\b/i.test(text)) return 'personal';
  return 'statement';
}

export interface Outcome {
  reach?: number | null;
  saves?: number | null;
}

// Same weighting as the existing angle loop (reach + 20×saves): reach is
// distribution, saves are the strongest intent signal on Instagram. Kept
// identical on purpose — two learners scoring creatives differently would pull
// the brief in opposite directions.
export function scoreOutcome(outcome: Outcome): number {
  return (outcome.reach ?? 0) + 20 * (outcome.saves ?? 0);
}

export type Dimension = 'angle' | 'hookPattern' | 'contentType' | 'overlayStyle' | 'imageProvider' | 'model';

export type StatRow = Outcome & Partial<Record<Dimension, string | null>>;

export interface DimensionStat {
  value: string;
  samples: number;
  meanScore: number;
  // False when `samples` is below MIN_CONFIDENT_SAMPLES — the mean is shown but
  // must not be acted on.
  confident: boolean;
}

// Mean outcome score per distinct value of one dimension, strongest first.
// Rows with a null/absent value for that dimension are skipped rather than
// bucketed as "unknown", so legacy rows can't invent a phantom category.
export function aggregateByDimension(
  rows: readonly StatRow[],
  dimension: Dimension,
): DimensionStat[] {
  const sums = new Map<string, { total: number; n: number }>();

  for (const row of rows) {
    const value = row[dimension];
    if (!value) continue;
    const cur = sums.get(value) ?? { total: 0, n: 0 };
    cur.total += scoreOutcome(row);
    cur.n += 1;
    sums.set(value, cur);
  }

  return [...sums.entries()]
    .map(([value, { total, n }]) => ({
      value,
      samples: n,
      meanScore: total / n,
      confident: n >= MIN_CONFIDENT_SAMPLES,
    }))
    .sort((a, b) => b.meanScore - a.meanScore);
}

export type RankVerdict = 'winner' | 'no_difference' | 'insufficient_data';

export interface RankResult {
  verdict: RankVerdict;
  // Only populated when verdict === 'winner'.
  leader: DimensionStat | null;
  // Always populated, so a caller can show the table even without a verdict.
  stats: DimensionStat[];
}

// Decides whether a dimension has actually told us anything yet.
//
// Requires THREE things before naming a winner:
//   1. at least two values to compare,
//   2. both leader and runner-up adequately sampled,
//   3. a lift above MIN_RELATIVE_LIFT.
// Anything less returns insufficient_data / no_difference, and the caller
// should leave generation behaviour alone.
export function rankDimension(rows: readonly StatRow[], dimension: Dimension): RankResult {
  const stats = aggregateByDimension(rows, dimension);
  if (stats.length < 2) return { verdict: 'insufficient_data', leader: null, stats };

  const [leader, runnerUp] = stats;
  if (!leader.confident || !runnerUp.confident) {
    return { verdict: 'insufficient_data', leader: null, stats };
  }

  // Guard the divide: an all-zero runner-up would make any lift infinite.
  const lift = runnerUp.meanScore > 0
    ? (leader.meanScore - runnerUp.meanScore) / runnerUp.meanScore
    : (leader.meanScore > 0 ? Infinity : 0);

  if (lift < MIN_RELATIVE_LIFT) return { verdict: 'no_difference', leader: null, stats };
  return { verdict: 'winner', leader, stats };
}
