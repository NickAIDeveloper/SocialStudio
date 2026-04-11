import type { InsightCard, PostData, CompetitorPostData } from './health-score';
import { getCompetitiveGrade, getEngagementTier } from './health-score';

export interface CompetitorAccount {
  handle: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
}

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

  const userHours = userPosts.map((p) => p.postedAt.getHours());
  const compHours = competitorPosts.map((p) => p.postedAt.getHours());

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

// --- new insight generators: scorecard, you-vs-them, schedule, hashtag mining ---

function buildCompetitiveScorecard(
  competitorPosts: CompetitorPostData[],
  competitorAccounts: CompetitorAccount[],
): InsightCard | null {
  if (competitorAccounts.length === 0) return null;

  const byHandle = groupByHandle(competitorPosts);

  const scorecards = competitorAccounts.map(acc => {
    const cposts = byHandle[acc.handle] ?? [];
    const hasData = cposts.length > 0;
    const avgEng = cposts.length > 0
      ? cposts.reduce((s, p) => s + getEngagement(p), 0) / cposts.length
      : 0;
    const engRate = acc.followerCount > 0 ? (avgEng / acc.followerCount) * 100 : 0;
    const freq = postsPerWeek(cposts);

    const tier = getEngagementTier(acc.followerCount);
    const engScore = Math.min(100, (engRate / Math.max(0.1, tier.avg)) * 50);
    const freqScore = Math.min(100, freq * 14.3);
    const sizeScore = Math.min(100, Math.log10(Math.max(1, acc.followerCount)) * 20);
    const totalScore = hasData ? Math.round(engScore * 0.5 + freqScore * 0.3 + sizeScore * 0.2) : -1;

    return {
      handle: acc.handle,
      grade: hasData ? getCompetitiveGrade(totalScore) : 'N/A',
      score: totalScore,
      engagement: Math.round(engRate * 100) / 100,
      postsPerWeek: Math.round(freq * 10) / 10,
      followers: acc.followerCount,
      avgLikes: cposts.length > 0 ? Math.round(cposts.reduce((s, p) => s + p.likes, 0) / cposts.length) : 0,
      avgComments: cposts.length > 0 ? Math.round(cposts.reduce((s, p) => s + p.comments, 0) / cposts.length) : 0,
      hasData,
    };
  }).sort((a, b) => b.score - a.score);

  const top = scorecards[0];
  if (!top) return null;

  return {
    id: 'competitive-scorecard',
    priority: 3,
    type: 'competitive-scorecard',
    icon: 'Award',
    title: `@${top.handle} leads with grade ${top.grade}`,
    verdict: 'opportunity',
    summary: `${scorecards.length} competitors scored. Top: @${top.handle} (${top.grade}), Bottom: @${scorecards[scorecards.length - 1]?.handle} (${scorecards[scorecards.length - 1]?.grade}).`,
    action: `Study @${top.handle}'s strategy \u2014 they have the strongest overall performance.`,
    data: { scorecards },
  };
}

function buildYouVsThem(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
  userAccount: CompetitorAccount | null,
  competitorAccounts: CompetitorAccount[],
): InsightCard | null {
  if (!userAccount || competitorAccounts.length === 0) return null;

  const byHandle = groupByHandle(competitorPosts);
  const userAvgEng = userPosts.length > 0 ? userPosts.reduce((s, p) => s + (p.likes + p.comments), 0) / userPosts.length : 0;
  const userEngRate = userAccount.followerCount > 0 ? (userAvgEng / userAccount.followerCount) * 100 : 0;
  const userFreq = postsPerWeek(userPosts);

  const you = {
    handle: userAccount.handle,
    followers: userAccount.followerCount,
    engRate: Math.round(userEngRate * 100) / 100,
    postsPerWeek: Math.round(userFreq * 10) / 10,
    avgLikes: userPosts.length > 0 ? Math.round(userPosts.reduce((s, p) => s + p.likes, 0) / userPosts.length) : 0,
    avgComments: userPosts.length > 0 ? Math.round(userPosts.reduce((s, p) => s + p.comments, 0) / userPosts.length) : 0,
  };

  const competitors = competitorAccounts.map(acc => {
    const cposts = byHandle[acc.handle] ?? [];
    const avgEng = cposts.length > 0 ? cposts.reduce((s, p) => s + getEngagement(p), 0) / cposts.length : 0;
    return {
      handle: acc.handle,
      followers: acc.followerCount,
      engRate: acc.followerCount > 0 ? Math.round((avgEng / acc.followerCount) * 10000) / 100 : 0,
      postsPerWeek: Math.round(postsPerWeek(cposts) * 10) / 10,
      avgLikes: cposts.length > 0 ? Math.round(cposts.reduce((s, p) => s + p.likes, 0) / cposts.length) : 0,
      avgComments: cposts.length > 0 ? Math.round(cposts.reduce((s, p) => s + p.comments, 0) / cposts.length) : 0,
    };
  });

  let wins = 0;
  for (const comp of competitors) {
    if (you.engRate > comp.engRate) wins++;
  }

  const compAvgRate = competitors.length > 0 ? competitors.reduce((s, c) => s + c.engRate, 0) / competitors.length : 0;

  return {
    id: 'you-vs-them',
    priority: 2,
    type: 'you-vs-them',
    icon: 'Swords',
    title: wins > competitors.length / 2
      ? `You beat ${wins}/${competitors.length} competitors on engagement`
      : `${competitors.length - wins}/${competitors.length} competitors outperform you`,
    verdict: wins > competitors.length / 2 ? 'positive' : 'negative',
    summary: `Your engagement rate: ${you.engRate}% vs competitor avg: ${compAvgRate.toFixed(2)}%.`,
    action: wins <= competitors.length / 2
      ? 'Focus on engagement quality \u2014 study top competitors\' most-engaged posts.'
      : 'Your engagement is strong. Focus on growth and consistency.',
    data: { you, competitors },
  };
}

function buildScheduleComparison(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
): InsightCard | null {
  if (userPosts.length < 3 || competitorPosts.length < 3) return null;

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const BLOCK_NAMES = ['Morning', 'Midday', 'Afternoon', 'Evening'];

  function getBlock(hour: number): number {
    if (hour >= 5 && hour < 11) return 0;
    if (hour >= 11 && hour < 14) return 1;
    if (hour >= 14 && hour < 18) return 2;
    return 3;
  }

  const yourHeatmap: number[][] = Array.from({ length: 7 }, () => Array(4).fill(0) as number[]);
  const compHeatmap: number[][] = Array.from({ length: 7 }, () => Array(4).fill(0) as number[]);

  for (const p of userPosts) {
    const d = new Date(p.postedAt);
    yourHeatmap[d.getDay()][getBlock(d.getHours())]++;
  }
  for (const p of competitorPosts) {
    const d = new Date(p.postedAt);
    compHeatmap[d.getDay()][getBlock(d.getHours())]++;
  }

  const gaps: Array<{ day: string; time: string }> = [];
  const opportunities: Array<{ day: string; time: string; compPosts: number }> = [];
  const maxComp = Math.max(...compHeatmap.flat(), 1);

  for (let d = 0; d < 7; d++) {
    for (let t = 0; t < 4; t++) {
      if (compHeatmap[d][t] === 0 && yourHeatmap[d][t] > 0) {
        gaps.push({ day: DAY_NAMES[d], time: BLOCK_NAMES[t] });
      }
      if (compHeatmap[d][t] >= maxComp * 0.5 && yourHeatmap[d][t] === 0) {
        opportunities.push({ day: DAY_NAMES[d], time: BLOCK_NAMES[t], compPosts: compHeatmap[d][t] });
      }
    }
  }

  return {
    id: 'schedule-comparison',
    priority: 3,
    type: 'schedule-comparison',
    icon: 'Clock',
    title: gaps.length > 0
      ? `${gaps.length} time slots where you post and competitors don't`
      : 'Your schedule overlaps heavily with competitors',
    verdict: gaps.length > 0 ? 'positive' : 'opportunity',
    summary: gaps.length > 0
      ? `Low-competition windows: ${gaps.slice(0, 3).map(g => `${g.day} ${g.time}`).join(', ')}.`
      : 'Consider posting at different times to stand out.',
    action: gaps.length > 0
      ? `Schedule important content for ${gaps[0]?.day} ${gaps[0]?.time} \u2014 no competitors post then.`
      : opportunities.length > 0
        ? `Try posting on ${opportunities[0]?.day} ${opportunities[0]?.time} \u2014 competitors get traction there.`
        : 'Experiment with different posting times to find your unique window.',
    data: { yourHeatmap, compHeatmap, gaps, opportunities },
  };
}

function buildHashtagMining(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
  competitorAccounts: CompetitorAccount[],
): InsightCard | null {
  const userTags = new Set(userPosts.flatMap(p => p.hashtags.map(t => t.toLowerCase().replace(/^#/, ''))));
  const byHandle = groupByHandle(competitorPosts);

  const tagData: Record<string, { usedBy: Set<string>; totalEng: number; count: number }> = {};
  for (const p of competitorPosts) {
    const eng = getEngagement(p);
    for (const rawTag of p.hashtags) {
      const tag = rawTag.toLowerCase().replace(/^#/, '');
      if (userTags.has(tag)) continue;
      const entry = tagData[tag] ?? { usedBy: new Set(), totalEng: 0, count: 0 };
      entry.usedBy.add(p.handle);
      entry.totalEng += eng;
      entry.count += 1;
      tagData[tag] = entry;
    }
  }

  const ranked = Object.entries(tagData)
    .filter(([, v]) => v.count >= 2)
    .map(([tag, v]) => ({
      tag,
      avgEng: Math.round(v.totalEng / v.count),
      usedBy: Array.from(v.usedBy),
      uses: v.count,
    }))
    .sort((a, b) => b.avgEng - a.avgEng)
    .slice(0, 10);

  if (ranked.length === 0) return null;

  return {
    id: 'hashtag-mining',
    priority: 2,
    type: 'hashtag-mining',
    icon: 'Hash',
    title: `${ranked.length} competitor hashtags you should steal`,
    verdict: 'opportunity',
    summary: `Top: #${ranked[0].tag} (avg ${ranked[0].avgEng} engagement, used by ${ranked[0].usedBy.length} competitors).`,
    action: `Try adding #${ranked.slice(0, 3).map(t => t.tag).join(' #')} to your next posts.`,
    data: { tags: ranked },
  };
}

// --- main export ---

export function generateCompetitorInsights(
  userPosts: PostData[],
  competitorPosts: CompetitorPostData[],
  userAccount?: CompetitorAccount | null,
  competitorAccounts?: CompetitorAccount[],
): InsightCard[] {
  if (competitorPosts.length === 0 && (!competitorAccounts || competitorAccounts.length === 0)) return [];

  const limitedMode = competitorPosts.length < 3;
  const accounts = competitorAccounts ?? [];

  const builders: Array<() => InsightCard | null> = [
    () => buildYouVsThem(userPosts, competitorPosts, userAccount ?? null, accounts),
    () => buildCompetitiveScorecard(competitorPosts, accounts),
    () => postingFrequencyCard(userPosts, competitorPosts),
    () => timingMismatchCard(userPosts, competitorPosts),
    () => buildScheduleComparison(userPosts, competitorPosts),
  ];

  if (!limitedMode) {
    builders.push(
      () => winningFormatCard(competitorPosts),
      () => stealFormulaCard(userPosts, competitorPosts),
      () => marketGapCard(competitorPosts),
      () => hashtagOpportunityCard(userPosts, competitorPosts),
      () => buildHashtagMining(userPosts, competitorPosts, accounts),
    );
  }

  return builders
    .map((build) => build())
    .filter((card): card is InsightCard => card !== null)
    .sort((a, b) => a.priority - b.priority);
}
