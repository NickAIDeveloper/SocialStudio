import type { InsightCard, PostData, HealthScoreInput } from './health-score';
import { calculateHealthScore } from './health-score';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const TIME_BLOCKS = [
  { label: 'morning', start: 5, end: 11 },
  { label: 'midday', start: 11, end: 14 },
  { label: 'afternoon', start: 14, end: 18 },
  { label: 'evening', start: 18, end: 24 },
] as const;

const CAPTION_BUCKETS = [
  { label: 'short', min: 0, max: 50 },
  { label: 'medium', min: 50, max: 120 },
  { label: 'long', min: 120, max: 200 },
  { label: 'very long', min: 200, max: Infinity },
] as const;

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function engagement(post: PostData): number {
  return post.likes + post.comments;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTimeBlock(hour: number): string {
  for (const block of TIME_BLOCKS) {
    if (hour >= block.start && hour < block.end) return block.label;
  }
  // Hours 0-4 fall outside defined blocks; treat as evening
  return 'evening';
}

function getTimeBlockIndex(label: string): number {
  return TIME_BLOCKS.findIndex((b) => b.label === label);
}

function getCaptionBucketLabel(words: number): string {
  for (const bucket of CAPTION_BUCKETS) {
    if (words >= bucket.min && words < bucket.max) return bucket.label;
  }
  return 'very long';
}

function clampPriority(value: number): number {
  return Math.max(1, Math.min(7, Math.round(value)));
}

function getActionForTrend(trend: 'up' | 'down' | 'flat'): string {
  switch (trend) {
    case 'up':
      return 'Keep doing what you\'re doing. Analyze your recent posts to understand the momentum.';
    case 'down':
      return 'Review your recent content strategy and compare it to your higher-performing period.';
    case 'flat':
      return 'Experiment with new content types or posting times to break through the plateau.';
  }
}

/** Map a ratio (best / worst or similar) to a 1-7 priority where bigger gap = lower number (higher priority). */
function gapToPriority(ratio: number): number {
  // ratio ~1 means no gap → priority 7
  // ratio >= 5 means huge gap → priority 1
  if (ratio <= 1) return 7;
  if (ratio >= 5) return 1;
  return clampPriority(7 - ((ratio - 1) / 4) * 6);
}

// ---------------------------------------------------------------------------
// Individual insight generators
// ---------------------------------------------------------------------------

function buildBestContentType(posts: PostData[]): InsightCard | null {
  const typeMap: Record<string, { total: number; count: number }> = {};
  for (const p of posts) {
    const entry = typeMap[p.contentType] ?? { total: 0, count: 0 };
    entry.total += engagement(p);
    entry.count += 1;
    typeMap[p.contentType] = entry;
  }

  const types = Object.entries(typeMap)
    .map(([type, v]) => ({ type, avgEngagement: safeDiv(v.total, v.count), count: v.count }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  if (types.length < 2) return null;

  const best = types[0];
  const worst = types[types.length - 1];
  const ratio = safeDiv(best.avgEngagement, worst.avgEngagement);
  const multiplier = Math.round(ratio * 10) / 10;

  return {
    id: 'best-content-type',
    priority: gapToPriority(ratio),
    type: 'best-content-type',
    icon: '📊',
    title: `Your ${best.type} get ${multiplier}x more engagement than ${worst.type}`,
    verdict: ratio > 2 ? 'opportunity' : 'positive',
    summary: `${best.type} posts average ${Math.round(best.avgEngagement)} engagement across ${best.count} posts, while ${worst.type} posts average ${Math.round(worst.avgEngagement)}.`,
    action: `Focus on creating more ${best.type} content and experiment with improving your ${worst.type} approach.`,
    data: { types },
  };
}

function buildOptimalTiming(posts: PostData[]): InsightCard | null {
  if (posts.length < 3) return null;

  // Build heatmap: 7 days x 4 time blocks
  const heatmapTotals: number[][] = Array.from({ length: 7 }, () => Array(4).fill(0) as number[]);
  const heatmapCounts: number[][] = Array.from({ length: 7 }, () => Array(4).fill(0) as number[]);

  for (const p of posts) {
    const d = new Date(p.postedAt);
    const dayIdx = d.getDay();
    const blockLabel = getTimeBlock(d.getHours());
    const blockIdx = getTimeBlockIndex(blockLabel);
    if (blockIdx === -1) continue;

    heatmapTotals[dayIdx][blockIdx] += engagement(p);
    heatmapCounts[dayIdx][blockIdx] += 1;
  }

  const heatmap: number[][] = heatmapTotals.map((row, di) =>
    row.map((total, bi) => safeDiv(total, heatmapCounts[di][bi]))
  );

  let bestDay = 0;
  let bestBlock = 0;
  let bestAvg = 0;
  for (let d = 0; d < 7; d++) {
    for (let b = 0; b < 4; b++) {
      if (heatmap[d][b] > bestAvg) {
        bestAvg = heatmap[d][b];
        bestDay = d;
        bestBlock = b;
      }
    }
  }

  const overallAvg = safeDiv(
    posts.reduce((s, p) => s + engagement(p), 0),
    posts.length
  );
  const ratio = safeDiv(bestAvg, overallAvg);

  const dayName = DAYS[bestDay];
  const blockName = TIME_BLOCKS[bestBlock].label;

  return {
    id: 'optimal-timing',
    priority: gapToPriority(ratio),
    type: 'optimal-timing',
    icon: '⏰',
    title: `${dayName} ${blockName} is your sweet spot`,
    verdict: ratio > 1.5 ? 'opportunity' : 'positive',
    summary: `Posts on ${dayName} ${blockName} average ${Math.round(bestAvg)} engagement, ${Math.round((ratio - 1) * 100)}% above your overall average.`,
    action: `Schedule your most important content for ${dayName} ${blockName} to maximize reach.`,
    data: { heatmap, bestDay: dayName, bestTime: blockName },
  };
}

function buildHashtagHealth(posts: PostData[]): InsightCard | null {
  const postsWithHashtags = posts.filter((p) => p.hashtags.length > 0);
  if (postsWithHashtags.length < 5) return null;

  const tagMap: Record<string, { total: number; count: number }> = {};
  for (const p of postsWithHashtags) {
    const eng = engagement(p);
    for (const tag of p.hashtags) {
      const entry = tagMap[tag] ?? { total: 0, count: 0 };
      entry.total += eng;
      entry.count += 1;
      tagMap[tag] = entry;
    }
  }

  const ranked = Object.entries(tagMap)
    .filter(([, v]) => v.count >= 2)
    .map(([tag, v]) => ({ tag, avg: safeDiv(v.total, v.count) }))
    .sort((a, b) => b.avg - a.avg);

  if (ranked.length < 2) return null;

  const good = ranked.slice(0, 5).map((t) => t.tag);
  const bad = ranked.slice(-5).map((t) => t.tag);

  const topAvg = ranked[0].avg;
  const bottomAvg = ranked[ranked.length - 1].avg;
  const ratio = safeDiv(topAvg, bottomAvg);
  const isWorking = topAvg > bottomAvg;

  return {
    id: 'hashtag-health',
    priority: gapToPriority(ratio),
    type: 'hashtag-health',
    icon: '#️⃣',
    title: `These hashtags are ${isWorking ? 'working' : 'dragging you down'}`,
    verdict: isWorking ? 'positive' : 'negative',
    summary: `Your top hashtags average ${Math.round(topAvg)} engagement while the worst average ${Math.round(bottomAvg)}.`,
    action: isWorking
      ? `Double down on ${good.slice(0, 3).join(', ')} and drop ${bad.slice(0, 3).join(', ')}.`
      : `Replace underperforming hashtags: ${bad.slice(0, 3).join(', ')} with more targeted ones.`,
    data: { good, bad },
  };
}

function buildCaptionLength(posts: PostData[]): InsightCard | null {
  if (posts.length < 3) return null;

  const bucketMap: Record<string, { total: number; count: number }> = {};
  let totalWords = 0;

  for (const p of posts) {
    const words = wordCount(p.caption);
    totalWords += words;
    const label = getCaptionBucketLabel(words);
    const entry = bucketMap[label] ?? { total: 0, count: 0 };
    entry.total += engagement(p);
    entry.count += 1;
    bucketMap[label] = entry;
  }

  const buckets = Object.entries(bucketMap)
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({ label, avg: safeDiv(v.total, v.count), count: v.count }))
    .sort((a, b) => b.avg - a.avg);

  if (buckets.length === 0) return null;

  const bestRange = buckets[0].label;
  const currentAvg = Math.round(safeDiv(totalWords, posts.length));
  const currentBucket = getCaptionBucketLabel(currentAvg);
  const inSweetSpot = currentBucket === bestRange;

  const title = inSweetSpot
    ? `Your caption length is in the sweet spot`
    : `Your captions should be ${bestRange} for better engagement`;

  // Priority: already in sweet spot → low priority; not → high
  const priority = inSweetSpot ? 7 : 2;

  const bestBucket = CAPTION_BUCKETS.find((b) => b.label === bestRange);
  const rangeMin = bestBucket?.min ?? 0;
  const rangeMax = bestBucket?.max === Infinity ? '200+' : (bestBucket?.max ?? 0);

  return {
    id: 'caption-length',
    priority,
    type: 'caption-length',
    icon: '📝',
    title,
    verdict: inSweetSpot ? 'positive' : 'opportunity',
    summary: `${bestRange} captions (${rangeMin}-${rangeMax} words) get the most engagement. Your average is ${currentAvg} words.`,
    action: inSweetSpot
      ? `Keep writing ${bestRange} captions, they perform best for your audience.`
      : `Aim for ${bestRange} captions instead of your current ${currentBucket} average.`,
    data: { bestRange, currentAvg, targetRange: bestRange },
  };
}

function buildMomentum(posts: PostData[]): InsightCard | null {
  const now = Date.now();
  const recent = posts.filter((p) => now - new Date(p.postedAt).getTime() < TWO_WEEKS_MS);
  const previous = posts.filter((p) => {
    const age = now - new Date(p.postedAt).getTime();
    return age >= TWO_WEEKS_MS && age < TWO_WEEKS_MS * 2;
  });

  if (recent.length === 0 || previous.length === 0) return null;

  const recentAvg = safeDiv(
    recent.reduce((s, p) => s + engagement(p), 0),
    recent.length
  );
  const prevAvg = safeDiv(
    previous.reduce((s, p) => s + engagement(p), 0),
    previous.length
  );

  const changePercent = Math.round(safeDiv(recentAvg - prevAvg, prevAvg) * 100);
  let trend: 'up' | 'down' | 'flat';
  let title: string;
  let verdict: InsightCard['verdict'];

  if (changePercent > 10) {
    trend = 'up';
    title = "You're on a roll";
    verdict = 'positive';
  } else if (changePercent < -10) {
    trend = 'down';
    title = "You're losing steam";
    verdict = 'negative';
  } else {
    trend = 'flat';
    title = 'Holding steady';
    verdict = 'positive';
  }

  // Priority: big decline = high priority, big growth = low priority, flat = medium
  let priority: number;
  if (trend === 'down') {
    priority = clampPriority(Math.max(1, 4 - Math.abs(changePercent) / 20));
  } else if (trend === 'up') {
    priority = clampPriority(Math.min(7, 4 + changePercent / 20));
  } else {
    priority = 5;
  }

  return {
    id: 'momentum',
    priority,
    type: 'momentum',
    icon: '📈',
    title,
    verdict,
    summary: `Your engagement ${trend === 'up' ? 'increased' : trend === 'down' ? 'decreased' : 'stayed about the same'} by ${Math.abs(changePercent)}% over the last 2 weeks.`,
    action: getActionForTrend(trend),
    data: {
      trend,
      changePercent,
      thisWeek: Math.round(recentAvg),
      prevWeek: Math.round(prevAvg),
    },
  };
}

function detectPostReasons(post: PostData, posts: PostData[], isTop: boolean): string[] {
  const reasons: string[] = [];
  const avgEng = safeDiv(
    posts.reduce((s, p) => s + engagement(p), 0),
    posts.length
  );
  const postEng = engagement(post);

  // Content type
  const typeAvgs: Record<string, { total: number; count: number }> = {};
  for (const p of posts) {
    const entry = typeAvgs[p.contentType] ?? { total: 0, count: 0 };
    entry.total += engagement(p);
    entry.count += 1;
    typeAvgs[p.contentType] = entry;
  }
  const typeAvg = safeDiv(typeAvgs[post.contentType]?.total ?? 0, typeAvgs[post.contentType]?.count ?? 1);
  if (isTop && typeAvg > avgEng * 1.2) {
    reasons.push(`${post.contentType} content performs well`);
  } else if (!isTop && typeAvg < avgEng * 0.8) {
    reasons.push(`${post.contentType} content underperforms`);
  }

  // Day of week
  const d = new Date(post.postedAt);
  const dayName = DAYS[d.getDay()];
  reasons.push(`Posted on ${dayName}`);

  // Time block
  const block = getTimeBlock(d.getHours());
  reasons.push(`Posted during ${block}`);

  // Hashtag count
  const avgHashtags = safeDiv(
    posts.reduce((s, p) => s + p.hashtags.length, 0),
    posts.length
  );
  if (isTop && post.hashtags.length > avgHashtags * 1.3) {
    reasons.push(`More hashtags than average (${post.hashtags.length})`);
  } else if (!isTop && post.hashtags.length < avgHashtags * 0.5) {
    reasons.push(`Fewer hashtags than average (${post.hashtags.length})`);
  }

  // Caption length
  const postWords = wordCount(post.caption);
  const avgWords = safeDiv(
    posts.reduce((s, p) => s + wordCount(p.caption), 0),
    posts.length
  );
  if (isTop && postWords > avgWords * 1.3) {
    reasons.push('Longer caption than average');
  } else if (isTop && postWords < avgWords * 0.7) {
    reasons.push('Shorter, punchier caption');
  } else if (!isTop && Math.abs(postWords - avgWords) > avgWords * 0.5) {
    reasons.push('Caption length far from sweet spot');
  }

  // Engagement magnitude
  if (isTop) {
    const multiplier = Math.round(safeDiv(postEng, avgEng) * 10) / 10;
    if (multiplier > 1) {
      reasons.push(`${multiplier}x your average engagement`);
    }
  } else {
    const pct = Math.round(safeDiv(postEng, avgEng) * 100);
    reasons.push(`Only ${pct}% of your average engagement`);
  }

  return reasons;
}

function buildTopPost(posts: PostData[]): InsightCard | null {
  if (posts.length < 2) return null;

  const sorted = [...posts].sort((a, b) => engagement(b) - engagement(a));
  const top = sorted[0];
  const reasons = detectPostReasons(top, posts, true);

  return {
    id: 'top-post',
    priority: 6, // informational, low urgency
    type: 'top-post',
    icon: '🏆',
    title: 'Your top post this month',
    verdict: 'positive',
    summary: `Your best post got ${engagement(top)} total engagement (${top.likes} likes, ${top.comments} comments).`,
    action: 'Study what made this post work and replicate those elements.',
    data: { post: top, reasons },
  };
}

function buildWorstPost(posts: PostData[]): InsightCard | null {
  if (posts.length < 2) return null;

  const sorted = [...posts].sort((a, b) => engagement(a) - engagement(b));
  const worst = sorted[0];
  const reasons = detectPostReasons(worst, posts, false);

  return {
    id: 'worst-post',
    priority: 5, // somewhat actionable
    type: 'worst-post',
    icon: '⚠️',
    title: 'Your worst post this month',
    verdict: 'negative',
    summary: `Your weakest post got ${engagement(worst)} total engagement (${worst.likes} likes, ${worst.comments} comments).`,
    action: 'Avoid repeating the patterns from this post. Check the reasons below.',
    data: { post: worst, reasons },
  };
}

// ---------------------------------------------------------------------------
// Health score derivation
// ---------------------------------------------------------------------------

function deriveHealthScoreInput(
  posts: PostData[],
  nicheAvgEngagement: number,
): HealthScoreInput {
  const now = Date.now();
  const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000;
  const postsLast4Weeks = posts.filter(
    (p) => now - new Date(p.postedAt).getTime() < fourWeeks
  ).length;

  const avgEng = safeDiv(
    posts.reduce((s, p) => s + engagement(p), 0),
    posts.length
  );

  const recent = posts.filter((p) => now - new Date(p.postedAt).getTime() < TWO_WEEKS_MS);
  const previous = posts.filter((p) => {
    const age = now - new Date(p.postedAt).getTime();
    return age >= TWO_WEEKS_MS && age < TWO_WEEKS_MS * 2;
  });

  const thisWeeksEngagement = safeDiv(
    recent.reduce((s, p) => s + engagement(p), 0),
    recent.length
  );
  const prevWeeksEngagement = safeDiv(
    previous.reduce((s, p) => s + engagement(p), 0),
    previous.length
  );

  const uniqueContentTypes = new Set(posts.map((p) => p.contentType)).size;

  return {
    avgEngagementRate: avgEng,
    nicheAvgEngagementRate: nicheAvgEngagement,
    postsLast4Weeks,
    targetPostsPerWeek: 4,
    thisWeeksEngagement,
    prevWeeksEngagement,
    uniqueContentTypes,
    totalContentTypes: 5, // possible types: quote, tip, carousel, community, promo
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function generateAnalyticsInsights(
  posts: PostData[],
  nicheAvgEngagement: number,
): { insights: InsightCard[]; healthScore: number } {
  if (posts.length === 0) {
    return { insights: [], healthScore: 0 };
  }

  const builders: Array<() => InsightCard | null> = [
    () => buildBestContentType(posts),
    () => buildOptimalTiming(posts),
    () => buildHashtagHealth(posts),
    () => buildCaptionLength(posts),
    () => buildMomentum(posts),
    () => buildTopPost(posts),
    () => buildWorstPost(posts),
  ];

  const insights: InsightCard[] = builders
    .map((build) => build())
    .filter((card): card is InsightCard => card !== null)
    .sort((a, b) => a.priority - b.priority);

  const healthInput = deriveHealthScoreInput(posts, nicheAvgEngagement);
  const healthScore = calculateHealthScore(healthInput);

  return { insights, healthScore };
}
