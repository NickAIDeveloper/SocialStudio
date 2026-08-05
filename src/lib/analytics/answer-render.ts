// Turns an /api/analytics/ask result row into sentences and tables.
//
// The panel used to print JSON.stringify(row) into a <pre>. The backend answers
// a FIXED set of hand-written questions (lib/analytics/questions.ts), so every
// row shape is known ahead of time and each one can have a real renderer. The
// generic key/value fallback exists so an unrecognised shape still reads as a
// labelled table. Nested values inside that fallback are summarised rather
// than dumped, so no path prints a raw object at the user.
//
// Pure, no I/O.

import { formatCount } from '@/lib/format-number';

export interface AnswerTable {
  caption: string | null;
  columns: string[];
  rows: string[][];
}

export interface RenderedAnswer {
  /** Which brand this block is about, when the row names one. */
  heading: string | null;
  sentences: string[];
  tables: AnswerTable[];
}

// ---------------------------------------------------------------------------
// Safe readers — every value arrives as JSON of unknown shape.
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function arr(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** "5 Aug 2026", or '' when there is no usable date. */
export function formatDay(v: unknown): string {
  if (v == null || v === '') return '';
  const d = v instanceof Date ? v : new Date(str(v));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Describes a change in plain words: "up 60%", "down 25%", "about the same". */
export function describeChange(current: number, baseline: number): string {
  if (baseline <= 0) return '';
  const ratio = current / baseline;
  const pct = Math.round(Math.abs(ratio - 1) * 100);
  if (pct < 10) return 'about the same';
  return ratio > 1 ? `up ${pct}%` : `down ${pct}%`;
}

function titleCase(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Describes a nested value in words. Previously this was JSON.stringify, which
 * put `[{"value":"question","samples":3}]` in a table cell: the exact raw-JSON
 * output this module exists to remove, just relocated into a nicer border.
 */
function summariseValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    return v.length === 0 ? 'None' : `${formatCount(v.length)} ${v.length === 1 ? 'item' : 'items'}`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>);
    return keys.length === 0 ? 'None' : keys.map(titleCase).join(', ');
  }
  return str(v);
}

/** Last-resort rendering: a labelled two-column table, never raw JSON. */
function keyValueTable(row: Record<string, unknown>): AnswerTable {
  return {
    caption: null,
    columns: ['Detail', 'Value'],
    rows: Object.entries(row)
      .filter(([k]) => k !== 'brand')
      .map(([k, v]) => [titleCase(k), summariseValue(v)]),
  };
}

// ---------------------------------------------------------------------------
// Per-question renderers
// ---------------------------------------------------------------------------

function reachTrend(row: Record<string, unknown>): Omit<RenderedAnswer, 'heading'> {
  const latest = num(row.latest);
  const previous = num(row.previousAverage);
  const postCount = num(row.posts);
  const sentences = [`Your most recent post reached ${plural(latest, 'person', 'people')}.`];

  const change = describeChange(latest, previous);
  if (change) {
    sentences.push(
      `The ${plural(Math.max(postCount - 1, 0), 'post', 'posts')} before it averaged ${formatCount(previous)}, so that is ${change}.`,
    );
  }
  sentences.push(
    `Across the last ${plural(postCount, 'post', 'posts')} you averaged ${formatCount(num(row.avgReach))} people reached and ${formatCount(num(row.avgViews))} views.`,
  );
  return { sentences, tables: [] };
}

function dimensionTable(
  caption: string,
  label: string,
  stats: Array<Record<string, unknown>>,
): AnswerTable {
  return {
    caption,
    columns: [label, 'Posts', 'Score', 'Trustworthy yet'],
    rows: stats.map((s) => [
      str(s.value).replace(/_/g, ' '),
      formatCount(num(s.samples)),
      num(s.meanScore).toFixed(2),
      s.confident ? 'Yes' : 'Too few posts',
    ]),
  };
}

function topHookPatterns(row: Record<string, unknown>): Omit<RenderedAnswer, 'heading'> {
  const shapes = arr(row.byHookShape);
  const angles = arr(row.byAngle);
  const sentences: string[] = [];
  const tables: AnswerTable[] = [];

  const best = shapes[0] ?? angles[0];
  if (best) {
    const what = shapes[0] ? 'hook shape' : 'angle';
    sentences.push(
      best.confident
        ? `Your best ${what} is ${str(best.value).replace(/_/g, ' ')}, measured across ${plural(num(best.samples), 'post', 'posts')}.`
        : `${str(best.value).replace(/_/g, ' ')} leads on ${what}, but only ${plural(num(best.samples), 'post', 'posts')} back it so far. Treat it as a hint, not a rule.`,
    );
  } else {
    sentences.push('None of your posts have enough recorded results to compare yet.');
  }

  if (shapes.length > 0) tables.push(dimensionTable('By hook shape', 'Hook shape', shapes));
  if (angles.length > 0) tables.push(dimensionTable('By angle', 'Angle', angles));
  return { sentences, tables };
}

function failedPosts(row: Record<string, unknown>): Omit<RenderedAnswer, 'heading'> {
  const failed = arr(row.failed);
  return {
    sentences: [`${plural(failed.length, 'post', 'posts')} failed to publish.`],
    tables:
      failed.length === 0
        ? []
        : [
            {
              caption: null,
              columns: ['When', 'Hook', 'Why it failed'],
              rows: failed.map((f) => [
                formatDay(f.at) || 'Unknown',
                str(f.hook) || 'No hook',
                str(f.reason) || 'No reason recorded',
              ]),
            },
          ],
  };
}

function adSpend(row: Record<string, unknown>): Omit<RenderedAnswer, 'heading'> {
  const total = num(row.totalAds);
  const sentences = [
    `You have ${plural(total, 'ad', 'ads')}: ${formatCount(num(row.active))} running, ${formatCount(num(row.paused))} paused, ${formatCount(num(row.failed))} failed.`,
  ];
  if (str(row.note)) sentences.push(str(row.note));
  return { sentences, tables: [] };
}

function painPoints(row: Record<string, unknown>): Omit<RenderedAnswer, 'heading'> {
  const trusted = arr(row.trusted);
  const alsoSeen = Array.isArray(row.alsoSeen) ? row.alsoSeen.map(str).filter(Boolean) : [];
  const sentences: string[] = [];

  const researched = formatDay(row.researchedAt);
  if (researched) sentences.push(`Researched ${researched}.`);

  if (trusted.length > 0) {
    const top = trusted[0];
    sentences.push(
      `The problem people raise most is ${str(top.theme)}, mentioned ${plural(num(top.mentions), 'time', 'times')}.`,
    );
  } else {
    sentences.push('Nothing has been mentioned often enough yet to call it a real pattern.');
  }
  if (alsoSeen.length > 0) {
    sentences.push(`Also seen, but less often: ${alsoSeen.join(', ')}.`);
  }

  return {
    sentences,
    tables:
      trusted.length === 0
        ? []
        : [
            {
              caption: null,
              columns: ['What people struggle with', 'Times mentioned', 'In their words'],
              rows: trusted.map((p) => [
                str(p.theme),
                formatCount(num(p.mentions)),
                str(p.quote) || 'No quote captured',
              ]),
            },
          ],
  };
}

function postingCadence(row: Record<string, unknown>): Omit<RenderedAnswer, 'heading'> {
  const enabled = row.enabled === true;
  const frequency = str(row.frequency) || 'no schedule set';
  const sentences = [
    enabled
      ? `Autopilot is on and set to post ${frequency}.`
      : `Autopilot is off. It is set to post ${frequency} when you turn it on.`,
    `${plural(num(row.published), 'post', 'posts')} published so far.`,
  ];

  const last = formatDay(row.lastRunAt);
  const next = formatDay(row.nextRunAt);
  if (last && next) sentences.push(`It last ran on ${last} and runs again on ${next}.`);
  else if (last) sentences.push(`It last ran on ${last}.`);
  else if (next) sentences.push(`It has not run yet. First run is due ${next}.`);

  if (str(row.lastError)) {
    sentences.push(`The last run reported a problem: ${str(row.lastError)}`);
  }
  return { sentences, tables: [] };
}

const RENDERERS: Record<string, (row: Record<string, unknown>) => Omit<RenderedAnswer, 'heading'>> = {
  reach_trend: reachTrend,
  top_hook_patterns: topHookPatterns,
  failed_posts: failedPosts,
  ad_spend: adSpend,
  pain_points: painPoints,
  posting_cadence: postingCadence,
};

export function renderAnswerRow(
  questionId: string,
  row: Record<string, unknown>,
): RenderedAnswer {
  const heading = str(row.brand) || null;
  const renderer = RENDERERS[questionId];
  if (!renderer) {
    return { heading, sentences: [], tables: [keyValueTable(row)] };
  }
  try {
    return { heading, ...renderer(row) };
  } catch (err) {
    // The safe readers coerce rather than throw, so reaching here means a BUG
    // in a renderer, not merely odd data. Log it: silently degrading to a
    // table would disguise the bug as an intentional layout.
    console.error('[answer-render] renderer threw', { questionId, err });
    return { heading, sentences: [], tables: [keyValueTable(row)] };
  }
}
