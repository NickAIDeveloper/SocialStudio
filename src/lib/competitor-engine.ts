import type { InsightCard, PostData, CompetitorPostData } from './health-score';

// --- helpers ---

function getEngagement(post: CompetitorPostData): number {
  return post.likes + post.comments;
}

function getWeekSpan(posts: { postedAt: Date }[]): number {
  if (posts.length < 2) return 1;
  const sorted = [...posts].sort(
    (a, b) => a.postedAt.getTime() - b.postedAt.getTime(),
  );
  const firstMs = sorted[0].postedAt.getTime();
  const lastMs = sorted[sorted.length - 1].postedAt.getTime();
  const weeks = (lastMs - firstMs) / (7 * 24 * 60 * 60 * 1000);
  return Math.max(1, weeks);
}

function postsPerWeek(posts: { postedAt: Date }[]): number {
  if (posts.length === 0) return 0;
  return posts.length / getWeekSpan(posts);
}

function detectFormat(caption: string): string {
  const lower = caption.toLowerCase();
  if (/\btip[s]?\b|^\d+[\.\)]/m.test(lower) || /[-•]\s/.test(caption)) {
    return 'tips';
  }
  const questionMarks = (caption.match(/\?/g) ?? []).length;
  if (questionMarks >= 2 || (questionMarks >= 1 && caption.length < 200)) {
    return 'questions';
  }
  if (/carousel|slide|swipe|multiple images/i.test(caption)) {
    return 'carousel';
  }
  if (/\bstory\b|\bstories\b|\bbehind the scenes\b|\bbts\b/i.test(caption)) {
    return 'story';
  }
  if (/\bquote\b|"|"/i.test(caption)) {
    return 'quotes';
  }
  return 'standard';
}

function getHour(date: Date): number {
  return date.getHours();
}

function groupByHandle(
  posts: CompetitorPostData[],
): Record<string, CompetitorPostData[]> {
  const grouped: Record<string, CompetitorPostData[]> = {};
  for (const p of posts) {
    const list = grouped[p.handle] ?? [];
    list.push(p);
    grouped[p.handle] = list;
  }
  return grouped;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// --- card generators ---

function postingFrequencyCard(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  const userFreq = postsPerWeek(userPosts);
  const byHandle = groupByHandle(competitorPosts);
  const handleFreqs = Object.entries(byHandle).map(([handle, posts]) => ({
    handle,
    freq: postsPerWeek(posts),
  }));
  if (handleFreqs.length === 0) return null;

  const competitorFreq =
    handleFreqs.reduce((sum, h) => sum + h.freq, 0) / handleFreqs.length;
  const top = handleFreqs.sort((a, b) => b.freq - a.freq)[0];
  const ratio = competitorFreq > 0 ? top.freq / Math.max(0.1, userFreq) : 0;

  const userAhead = userFreq >= competitorFreq;
  const title = userAhead
    ? "You're posting more than your competitors"
    : `@${top.handle} posts ${Math.round(ratio)}x more often than you`;

  return {
    id: 'posting-frequency',
    priority: userAhead ? 5 : 2,
    type: 'posting-frequency',
    icon: 'CalendarClock',
    title,
    verdict: userAhead ? 'positive' : 'negative',
    summary: userAhead
      ? `You post ~${userFreq.toFixed(1)}/week vs competitor avg ${competitorFreq.toFixed(1)}/week.`
      : `You post ~${userFreq.toFixed(1)}/week while competitors average ${competitorFreq.toFixed(1)}/week.`,
    action: userAhead
      ? 'Maintain your posting cadence and focus on quality.'
      : `Increase posting frequency to at least ${Math.ceil(competitorFreq)}/week.`,
    data: {
      userFreq: Math.round(userFreq * 10) / 10,
      competitorFreq: Math.round(competitorFreq * 10) / 10,
      topCompetitor: top.handle,
    },
  };
}

function winningFormatCard(
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  const formatCounts: Record<string, number> = {};
  for (const p of competitorPosts) {
    const fmt = detectFormat(p.caption);
    formatCounts[fmt] = (formatCounts[fmt] ?? 0) + 1;
  }

  const total = competitorPosts.length;
  const formats = Object.entries(formatCounts)
    .map(([type, count]) => ({
      type,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);

  if (formats.length === 0) return null;
  const dominant = formats[0];

  return {
    id: 'winning-format',
    priority: 3,
    type: 'winning-format',
    icon: 'LayoutGrid',
    title: `${dominant.type.charAt(0).toUpperCase() + dominant.type.slice(1)} dominates your niche`,
    verdict: 'opportunity',
    summary: `${dominant.percentage}% of competitor content uses the ${dominant.type} format.`,
    action: `Experiment with more ${dominant.type}-style posts to match niche trends.`,
    data: { formats },
  };
}

function stealFormulaCard(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  const userFormats = new Set(userPosts.map((p) => detectFormat(p.caption)));

  const byHandle = groupByHandle(competitorPosts);
  let bestMatch: {
    handle: string;
    pattern: string;
    avgEngagement: number;
  } | null = null;

  for (const [handle, posts] of Object.entries(byHandle)) {
    const formatEngagement: Record<string, number[]> = {};
    for (const p of posts) {
      const fmt = detectFormat(p.caption);
      const list = formatEngagement[fmt] ?? [];
      list.push(getEngagement(p));
      formatEngagement[fmt] = list;
    }

    for (const [fmt, engagements] of Object.entries(formatEngagement)) {
      if (userFormats.has(fmt)) continue;
      const avg = engagements.reduce((s, v) => s + v, 0) / engagements.length;
      if (!bestMatch || avg > bestMatch.avgEngagement) {
        bestMatch = { handle, pattern: fmt, avgEngagement: avg };
      }
    }
  }

  if (!bestMatch) return null;

  return {
    id: 'steal-formula',
    priority: 1,
    type: 'steal-formula',
    icon: 'Lightbulb',
    title: `Try ${bestMatch.pattern} like @${bestMatch.handle}`,
    verdict: 'opportunity',
    summary: `@${bestMatch.handle} averages ${Math.round(bestMatch.avgEngagement)} engagements on ${bestMatch.pattern} posts and you haven't tried this format.`,
    action: `Create a ${bestMatch.pattern}-style post this week and measure the response.`,
    data: {
      competitor: bestMatch.handle,
      pattern: bestMatch.pattern,
      theirAvgEngagement: Math.round(bestMatch.avgEngagement),
    },
  };
}

function timingMismatchCard(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  if (userPosts.length === 0 || competitorPosts.length === 0) return null;

  const userHours = userPosts.map((p) => getHour(p.postedAt));
  const compHours = competitorPosts.map((p) => getHour(p.postedAt));

  const userPeakHour = median(userHours);
  const competitorPeakHour = median(compHours);
  const diff = Math.abs(userPeakHour - competitorPeakHour);
  const overlap = diff <= 2;

  return {
    id: 'timing-mismatch',
    priority: overlap ? 5 : 1,
    type: 'timing-mismatch',
    icon: 'Clock',
    title: overlap
      ? 'Your timing matches the market'
      : "You're posting when nobody's looking",
    verdict: overlap ? 'positive' : 'negative',
    summary: overlap
      ? `You post around ${Math.round(userPeakHour)}:00, close to competitor peak of ${Math.round(competitorPeakHour)}:00.`
      : `You post around ${Math.round(userPeakHour)}:00 but competitors peak at ${Math.round(competitorPeakHour)}:00.`,
    action: overlap
      ? 'Keep your current posting schedule.'
      : `Shift posting time closer to ${Math.round(competitorPeakHour)}:00 for better visibility.`,
    data: {
      userPeakHour: Math.round(userPeakHour),
      competitorPeakHour: Math.round(competitorPeakHour),
      overlap,
    },
  };
}

function marketGapCard(
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  const formatEngagement: Record<string, number[]> = {};
  for (const p of competitorPosts) {
    const fmt = detectFormat(p.caption);
    const list = formatEngagement[fmt] ?? [];
    list.push(getEngagement(p));
    formatEngagement[fmt] = list;
  }

  const allFormats = ['tips', 'questions', 'carousel', 'story', 'quotes', 'standard'];
  const coveredFormats = Object.keys(formatEngagement);
  const missingFormats = allFormats.filter((f) => !coveredFormats.includes(f));

  // Check for absent formats first
  if (missingFormats.length > 0) {
    const gapType = missingFormats[0];
    return {
      id: 'market-gap',
      priority: 1,
      type: 'market-gap',
      icon: 'Target',
      title: `Nobody in your niche is doing ${gapType}`,
      verdict: 'opportunity',
      summary: `No competitors are creating ${gapType} content, leaving a gap you can fill.`,
      action: `Start producing ${gapType} content to differentiate from competitors.`,
      data: { gapType, opportunity: 'absent' },
    };
  }

  // Fall back to low-engagement formats
  const avgByFormat = Object.entries(formatEngagement)
    .map(([type, engs]) => ({
      type,
      avg: engs.reduce((s, v) => s + v, 0) / engs.length,
    }))
    .sort((a, b) => a.avg - b.avg);

  if (avgByFormat.length === 0) return null;
  const weakest = avgByFormat[0];

  return {
    id: 'market-gap',
    priority: 2,
    type: 'market-gap',
    icon: 'Target',
    title: `Nobody in your niche is doing ${weakest.type} well`,
    verdict: 'opportunity',
    summary: `${weakest.type} content gets the lowest engagement among competitors (avg ${Math.round(weakest.avg)}).`,
    action: `Create high-quality ${weakest.type} content to stand out where competitors are weak.`,
    data: { gapType: weakest.type, opportunity: 'low-engagement' },
  };
}

function hashtagOpportunityCard(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  const userTags = new Set(
    userPosts.flatMap((p) => p.hashtags.map((t) => t.toLowerCase())),
  );

  const tagEngagement: Record<string, number[]> = {};
  for (const p of competitorPosts) {
    const eng = getEngagement(p);
    for (const tag of p.hashtags) {
      const lower = tag.toLowerCase();
      if (userTags.has(lower)) continue;
      const list = tagEngagement[lower] ?? [];
      list.push(eng);
      tagEngagement[lower] = list;
    }
  }

  const ranked = Object.entries(tagEngagement)
    .filter(([, engs]) => engs.length >= 2)
    .map(([tag, engs]) => ({
      tag,
      avg: engs.reduce((s, v) => s + v, 0) / engs.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  if (ranked.length === 0) return null;

  const topTags = ranked.slice(0, 5);
  const avgEngagement = Math.round(
    topTags.reduce((s, t) => s + t.avg, 0) / topTags.length,
  );

  return {
    id: 'hashtag-opportunity',
    priority: 2,
    type: 'hashtag-opportunity',
    icon: 'Hash',
    title: "These tags work for competitors but you're not using them",
    verdict: 'opportunity',
    summary: `${topTags.length} competitor hashtags average ${avgEngagement} engagements and you haven't used any of them.`,
    action: `Add tags like ${topTags.map((t) => `#${t.tag}`).join(', ')} to your next posts.`,
    data: {
      tags: topTags.map((t) => t.tag),
      avgEngagement,
    },
  };
}

// --- main export ---

export function generateCompetitorInsights(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard[] {
  if (competitorPosts.length === 0) return [];

  const limitedMode = competitorPosts.length < 3;

  const cards: InsightCard[] = [];

  const freqCard = postingFrequencyCard(userPosts, competitorPosts);
  if (freqCard) cards.push(freqCard);

  const timingCard = timingMismatchCard(userPosts, competitorPosts);
  if (timingCard) cards.push(timingCard);

  if (!limitedMode) {
    const formatCard = winningFormatCard(competitorPosts);
    if (formatCard) cards.push(formatCard);

    const stealCard = stealFormulaCard(userPosts, competitorPosts);
    if (stealCard) cards.push(stealCard);

    const gapCard = marketGapCard(competitorPosts);
    if (gapCard) cards.push(gapCard);

    const tagCard = hashtagOpportunityCard(userPosts, competitorPosts);
    if (tagCard) cards.push(tagCard);
  }

  return cards.sort((a, b) => a.priority - b.priority);
}
