// Post-level leaderboard for the organic (Instagram) surface.
//
// The genome page used to rank abstract INGREDIENTS with shrinkage-adjusted
// scores. This ranks the actual posts, which is the thing a marketer can act
// on: "this one worked, make more like it".
//
// Ranking metric is REACH, descending. Reach exists today for every analysed
// post, it is what the autopilot brain already optimises, and it answers
// "which posts worked". Likes and engagement rate are shown but do not rank:
// likes alone would promote small-reach flukes to the top.
//
// Pure, no I/O. The route supplies rows straight from the DB join.

import { CREATIVE_ANGLES, type AngleId } from '@/lib/smart-posts/creative-angles';
import { classifyHookAngle } from '@/lib/smart-posts/hook-variety';
import { MIN_CONFIDENT_SAMPLES } from '@/lib/brain/creative-stats';
import { formatCount } from '@/lib/format-number';

/**
 * Marketer-facing names for the angles. The labels on CREATIVE_ANGLES are
 * written for the generation prompt ("Concrete number / data point"), which
 * reads as machinery on a chip and worse inside a sentence.
 */
const ANGLE_LABEL: Record<AngleId, string> = {
  question: 'Question',
  stat: 'Number',
  story: 'Story',
  myth: 'Myth buster',
  command: 'Instruction',
  confession: 'Confession',
  howto: 'How to',
  contrarian: 'Hot take',
  curiosity: 'Curiosity gap',
  metaphor: 'Comparison',
};

const KNOWN_ANGLES = new Set<string>(CREATIVE_ANGLES.map((a) => a.id));

const MAX_HEADLINE = 90;

/** Below this share of tagged posts we cannot say anything about angles. */
const MIN_ANGLE_COVERAGE = 0.5;
/**
 * An angle needs this many posts before its average means anything. Same bar
 * the genome uses to call a score confident, for the same reason: two lucky
 * posts are not a finding, and this sentence tells the user what to do next.
 */
const MIN_ANGLE_POSTS = MIN_CONFIDENT_SAMPLES;
/** An angle must out-reach the others by this much to be worth recommending. */
const MIN_ANGLE_LIFT = 1.2;
/** Below this multiple the best-vs-typical spread is not worth a sentence. */
const MIN_INTERESTING_SPREAD = 1.5;

export interface LeaderboardPostInput {
  postId: string;
  caption: string | null;
  hookText: string | null;
  /** `posts.angle`, set by the LRU rotation at generation time. Null on legacy rows. */
  angle: string | null;
  imageUrl: string | null;
  publishedAt: Date | string | null;
  reach: number | null;
  likes: number | null;
}

export interface LeaderboardRow {
  postId: string;
  rank: number;
  headline: string;
  imageUrl: string | null;
  publishedAt: string | null;
  reach: number;
  likes: number;
  /** Likes per person reached. Null when the post reached nobody. */
  engagementRate: number | null;
  angleId: AngleId | null;
  angleLabel: string | null;
}

function num(v: number | null | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function firstLine(text: string | null | undefined): string {
  const line = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line ?? '';
}

function headlineFor(input: LeaderboardPostInput): string {
  const raw = firstLine(input.caption) || firstLine(input.hookText);
  if (!raw) return 'Untitled post';
  return raw.length > MAX_HEADLINE ? raw.slice(0, MAX_HEADLINE - 1).trimEnd() + '…' : raw;
}

/**
 * The angle we are willing to claim for a post: the recorded one when it is a
 * known angle, otherwise inferred from the hook. Posts with neither get null
 * rather than a guessed default, so the verdict never counts a fabricated tag.
 */
function angleFor(input: LeaderboardPostInput): AngleId | null {
  if (input.angle && KNOWN_ANGLES.has(input.angle)) return input.angle as AngleId;
  const hook = String(input.hookText ?? '').trim();
  if (!hook) return null;
  return classifyHookAngle(hook);
}

function isoOf(value: Date | string | null): string | null {
  if (value === null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Re-exported so ads.ts and this module's callers keep one import site.
export { formatCount };

export function rankOrganicPosts(inputs: readonly LeaderboardPostInput[]): LeaderboardRow[] {
  return [...inputs]
    .map((input) => {
      const reach = num(input.reach);
      const likes = num(input.likes);
      const angleId = angleFor(input);
      return {
        postId: input.postId,
        rank: 0,
        headline: headlineFor(input),
        imageUrl: input.imageUrl,
        publishedAt: isoOf(input.publishedAt),
        reach,
        likes,
        engagementRate: reach > 0 ? likes / reach : null,
        angleId,
        angleLabel: angleId ? ANGLE_LABEL[angleId] : null,
      };
    })
    .sort((a, b) => {
      if (b.reach !== a.reach) return b.reach - a.reach;
      if (b.likes !== a.likes) return b.likes - a.likes;
      return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
    })
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * The angle worth recommending: the one whose posts REACH more than the rest,
 * not the one that merely appears most often.
 *
 * This distinction is the whole point. The autopilot feed collapsed into one
 * hook shape ("Your pace is lying" / "Your X is Y"), which classifies as
 * `myth`. Counting occurrences would therefore crown `myth` on nearly every
 * account and tell the user to make more of the exact pattern the variety
 * engine exists to break up. Comparing averages instead asks whether the angle
 * actually earned its position, and stays silent when it did not.
 */
function bestPerformingAngle(
  rows: readonly LeaderboardRow[],
): { angle: AngleId; mean: number; restMean: number } | null {
  const tagged = rows.filter((r) => r.angleId !== null);
  if (rows.length === 0 || tagged.length / rows.length < MIN_ANGLE_COVERAGE) return null;

  const byAngle = new Map<AngleId, number[]>();
  for (const row of tagged) {
    const list = byAngle.get(row.angleId!) ?? [];
    list.push(row.reach);
    byAngle.set(row.angleId!, list);
  }

  const candidates = [...byAngle.entries()].filter(([, r]) => r.length >= MIN_ANGLE_POSTS);
  // With only one candidate there is nothing to be better THAN.
  if (candidates.length < 2) return null;

  const ranked = candidates
    .map(([angle, reaches]) => ({ angle, mean: mean(reaches) }))
    .sort((a, b) => b.mean - a.mean);

  const best = ranked[0];
  const restMean = mean(tagged.filter((r) => r.angleId !== best.angle).map((r) => r.reach));
  if (restMean <= 0 || best.mean / restMean < MIN_ANGLE_LIFT) return null;

  return { angle: best.angle, mean: best.mean, restMean };
}

/**
 * One plain sentence at the top of the page saying what to do next.
 *
 * Preference order, each falling through when the data cannot support it:
 *   1. Name the angle that genuinely out-reaches the others.
 *   2. Report how far the best post beat a typical one.
 *   3. State the plain total.
 */
export function buildVerdict(
  rows: readonly LeaderboardRow[],
  opts: { topN?: number } = {},
): string | null {
  const { topN = 10 } = opts;
  const top = rows.slice(0, topN);
  if (top.length === 0) return null;

  const totalReach = top.reduce((sum, r) => sum + r.reach, 0);
  const opener = `Your top ${top.length} posts reached ${formatCount(totalReach)} people.`;

  const winner = bestPerformingAngle(rows);
  if (winner) {
    const label = ANGLE_LABEL[winner.angle].toLowerCase();
    const article = /^[aeiou]/.test(label) ? 'an' : 'a';
    return `${opener} Posts that open with ${article} ${label} reach ${formatCount(winner.mean)} people on average, against ${formatCount(winner.restMean)} for the rest. Do more of those.`;
  }

  const typical = median(rows.map((r) => r.reach));
  const best = rows[0]?.reach ?? 0;
  if (typical > 0 && best / typical >= MIN_INTERESTING_SPREAD) {
    return `Your best post reached ${(best / typical).toFixed(1)}x more people than your typical post.`;
  }

  return opener;
}
