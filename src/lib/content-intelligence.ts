import type { ScrapedPost } from '@/lib/instagram-scraper';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostPattern {
  /** What pattern was identified */
  pattern: string;
  /** How many posts match this pattern */
  count: number;
  /** Average engagement (likes + comments) for posts matching */
  avgEngagement: number;
  /** Example post shortcodes */
  examples: string[];
  /** Whether this is a winning or losing pattern */
  verdict: 'winning' | 'losing' | 'neutral';
}

export interface TimingInsight {
  bestDays: { day: string; avgEngagement: number }[];
  bestHours: { hour: number; avgEngagement: number }[];
  bestWindows: { day: string; hour: number; avgEngagement: number }[];
  worstDays: { day: string; avgEngagement: number }[];
}

export interface HashtagInsight {
  topPerforming: { tag: string; avgEngagement: number; useCount: number }[];
  underperforming: { tag: string; avgEngagement: number; useCount: number }[];
  optimalCount: number;
  optimalCountAvgEng: number;
}

export interface ContentInsight {
  category: 'content' | 'timing' | 'hashtags' | 'format' | 'competitor';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  dataPoints: string[];
}

export interface CompetitorBenchmark {
  handle: string;
  brand: 'affectly' | 'pacebrain';
  totalPosts: number;
  avgLikes: number;
  avgComments: number;
  avgEngagement: number;
  topHashtags: { tag: string; avgEngagement: number; count: number }[];
  bestPostingDays: string[];
  bestPostingHours: number[];
  winningPatterns: PostPattern[];
  /** What they do that we should replicate */
  lessonsForUs: string[];
}

export interface IntelligenceReport {
  generatedAt: string;
  /** Our own performance analysis */
  ownPerformance: {
    totalPosts: number;
    avgEngagement: number;
    winningPatterns: PostPattern[];
    losingPatterns: PostPattern[];
    timingInsights: TimingInsight;
    hashtagInsights: HashtagInsight;
    captionInsights: {
      bestLengthRange: string;
      avgLength: number;
      bestCTAPatterns: string[];
    };
  };
  /** Competitor benchmarks */
  competitorBenchmarks: CompetitorBenchmark[];
  /** Actionable insights combining own + competitor analysis */
  insights: ContentInsight[];
  /** Specific "do this next" recommendations */
  actionPlan: {
    title: string;
    description: string;
    basedOn: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function engagement(post: ScrapedPost): number {
  return post.likes + post.comments;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Caption pattern matchers
const CAPTION_PATTERNS: { name: string; test: (caption: string) => boolean }[] = [
  { name: 'Asks a question', test: (c) => /\?/.test(c) },
  { name: 'Uses numbered list', test: (c) => /\b[1-9]\.\s/.test(c) || /[①-⑨]/.test(c) },
  { name: 'Has a CTA (call-to-action)', test: (c) => /\b(link in bio|drop|comment|tag someone|share|save this|try it|download|sign up|click)\b/i.test(c) },
  { name: 'Uses emoji', test: (c) => /[\u{1F300}-\u{1FAFF}]/u.test(c) },
  { name: 'Storytelling (personal narrative)', test: (c) => /\b(I used to|my experience|here.s what happened|true story|confession)\b/i.test(c) },
  { name: 'Myth-busting / contrarian', test: (c) => /\b(myth|actually|truth is|unpopular opinion|hot take|stop believing|wrong about)\b/i.test(c) },
  { name: 'Educational / how-to', test: (c) => /\b(how to|tip|step|guide|learn|here.s why|the science|research shows)\b/i.test(c) },
  { name: 'Social proof / testimonial', test: (c) => /\b(testimonial|said|told me|review|feedback|users say|students say)\b/i.test(c) || /[""].*[""]/.test(c) },
  { name: 'Urgency / scarcity', test: (c) => /\b(limited|hurry|now available|launching|coming soon|don.t miss|last chance)\b/i.test(c) },
  { name: 'Relatable pain point', test: (c) => /\b(ever feel|tired of|struggling with|frustrated|overwhelmed|burnt out|have you ever)\b/i.test(c) },
  { name: 'Short and punchy (under 100 chars)', test: (c) => c.replace(/#\w+/g, '').trim().length < 100 },
  { name: 'Long-form (500+ chars)', test: (c) => c.length > 500 },
  { name: 'Carousel / swipe prompt', test: (c) => /\b(swipe|carousel|slide|next|→|➡)\b/i.test(c) },
  { name: 'Community engagement prompt', test: (c) => /\b(drop .* below|tell us|what.s your|comment your|share your)\b/i.test(c) },
];

// CTA pattern extraction
const CTA_PATTERNS = [
  'link in bio', 'try it free', 'download now', 'sign up', 'comment below',
  'tag someone', 'save this', 'share with', 'drop your', 'tell us',
  'swipe to', 'click the link', 'join us', 'start today', 'learn more',
];

// ---------------------------------------------------------------------------
// Analysis functions
// ---------------------------------------------------------------------------

function analyzePatterns(posts: ScrapedPost[]): { winning: PostPattern[]; losing: PostPattern[] } {
  if (posts.length === 0) return { winning: [], losing: [] };

  const avgEng = safeDiv(posts.reduce((s, p) => s + engagement(p), 0), posts.length);
  const patterns: PostPattern[] = [];

  for (const { name, test } of CAPTION_PATTERNS) {
    const matching = posts.filter((p) => test(p.caption));
    if (matching.length < 2) continue;

    const patternAvg = safeDiv(matching.reduce((s, p) => s + engagement(p), 0), matching.length);
    const ratio = safeDiv(patternAvg, avgEng);

    patterns.push({
      pattern: name,
      count: matching.length,
      avgEngagement: patternAvg,
      examples: matching.slice(0, 3).map((p) => p.shortcode),
      verdict: ratio > 1.3 ? 'winning' : ratio < 0.7 ? 'losing' : 'neutral',
    });
  }

  patterns.sort((a, b) => b.avgEngagement - a.avgEngagement);

  return {
    winning: patterns.filter((p) => p.verdict === 'winning'),
    losing: patterns.filter((p) => p.verdict === 'losing'),
  };
}

function analyzeTiming(posts: ScrapedPost[]): TimingInsight {
  const dayMap: Record<string, { total: number; count: number }> = {};
  const hourMap: Record<number, { total: number; count: number }> = {};
  const windowMap: Record<string, { day: string; hour: number; total: number; count: number }> = {};

  for (const p of posts) {
    const eng = engagement(p);
    const parsedDate = p.timestamp ? new Date(p.timestamp) : null;
    const isValidDate = parsedDate && !isNaN(parsedDate.getTime());
    const day = p.dayOfWeek || (isValidDate ? DAYS[parsedDate.getDay()] : null);
    const hour = p.hourPosted ?? (isValidDate ? parsedDate.getHours() : null);
    if (!day || hour === null) continue;

    const d = dayMap[day] || { total: 0, count: 0 };
    d.total += eng; d.count += 1; dayMap[day] = d;

    const h = hourMap[hour] || { total: 0, count: 0 };
    h.total += eng; h.count += 1; hourMap[hour] = h;

    const key = `${day}-${hour}`;
    const w = windowMap[key] || { day, hour, total: 0, count: 0 };
    w.total += eng; w.count += 1; windowMap[key] = w;
  }

  const dayRanked = Object.entries(dayMap)
    .map(([day, v]) => ({ day, avgEngagement: safeDiv(v.total, v.count) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  const hourRanked = Object.entries(hourMap)
    .map(([h, v]) => ({ hour: Number(h), avgEngagement: safeDiv(v.total, v.count) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  const windowRanked = Object.values(windowMap)
    .map((w) => ({ day: w.day, hour: w.hour, avgEngagement: safeDiv(w.total, w.count) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  return {
    bestDays: dayRanked.slice(0, 3),
    bestHours: hourRanked.slice(0, 5),
    bestWindows: windowRanked.slice(0, 5),
    worstDays: [...dayRanked].reverse().slice(0, 2),
  };
}

function analyzeHashtags(posts: ScrapedPost[]): HashtagInsight {
  const tagMap: Record<string, { totalEng: number; count: number }> = {};
  const countMap: Record<number, { totalEng: number; count: number }> = {};

  for (const p of posts) {
    const eng = engagement(p);
    const tags = p.hashtags || (p.caption.match(/#\w+/g) || []).map((t) => t.toLowerCase());
    const count = tags.length;

    const cm = countMap[count] || { totalEng: 0, count: 0 };
    cm.totalEng += eng; cm.count += 1; countMap[count] = cm;

    for (const tag of tags) {
      const tm = tagMap[tag] || { totalEng: 0, count: 0 };
      tm.totalEng += eng; tm.count += 1; tagMap[tag] = tm;
    }
  }

  const allTags = Object.entries(tagMap)
    .map(([tag, v]) => ({ tag, avgEngagement: safeDiv(v.totalEng, v.count), useCount: v.count }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  const avgTagEng = safeDiv(allTags.reduce((s, t) => s + t.avgEngagement, 0), allTags.length);

  const countRanked = Object.entries(countMap)
    .map(([c, v]) => ({ count: Number(c), avg: safeDiv(v.totalEng, v.count) }))
    .sort((a, b) => b.avg - a.avg);

  return {
    topPerforming: allTags.filter((t) => t.avgEngagement > avgTagEng && t.useCount >= 2).slice(0, 10),
    underperforming: allTags.filter((t) => t.avgEngagement < avgTagEng * 0.5 && t.useCount >= 2).slice(-10),
    optimalCount: countRanked[0]?.count ?? 5,
    optimalCountAvgEng: countRanked[0]?.avg ?? 0,
  };
}

function analyzeCaptions(posts: ScrapedPost[]) {
  const buckets: Record<string, { totalEng: number; count: number }> = {
    '0-100': { totalEng: 0, count: 0 },
    '101-300': { totalEng: 0, count: 0 },
    '301-500': { totalEng: 0, count: 0 },
    '500+': { totalEng: 0, count: 0 },
  };

  for (const p of posts) {
    const eng = engagement(p);
    const len = p.captionLength || p.caption.length;
    const bucket = len <= 100 ? '0-100' : len <= 300 ? '101-300' : len <= 500 ? '301-500' : '500+';
    buckets[bucket].totalEng += eng;
    buckets[bucket].count += 1;
  }

  const bestBucket = Object.entries(buckets)
    .filter(([, v]) => v.count > 0)
    .map(([range, v]) => ({ range, avg: safeDiv(v.totalEng, v.count) }))
    .sort((a, b) => b.avg - a.avg);

  const avgLength = safeDiv(
    posts.reduce((s, p) => s + (p.captionLength || p.caption.length), 0),
    posts.length,
  );

  // Find which CTAs appear in high-performing posts
  const avgEng = safeDiv(posts.reduce((s, p) => s + engagement(p), 0), posts.length);
  const highPerformers = posts.filter((p) => engagement(p) > avgEng);
  const ctaCounts: Record<string, number> = {};
  for (const p of highPerformers) {
    const lower = p.caption.toLowerCase();
    for (const cta of CTA_PATTERNS) {
      if (lower.includes(cta)) {
        ctaCounts[cta] = (ctaCounts[cta] || 0) + 1;
      }
    }
  }
  const bestCTAs = Object.entries(ctaCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([cta]) => cta);

  return {
    bestLengthRange: bestBucket[0]?.range ?? '101-300',
    avgLength: Math.round(avgLength),
    bestCTAPatterns: bestCTAs,
  };
}

function analyzeCompetitor(posts: ScrapedPost[], handle: string, brand: 'affectly' | 'pacebrain'): CompetitorBenchmark {
  const accountPosts = posts.filter((p) => p.accountHandle === handle);
  const avgLikes = safeDiv(accountPosts.reduce((s, p) => s + p.likes, 0), accountPosts.length);
  const avgComments = safeDiv(accountPosts.reduce((s, p) => s + p.comments, 0), accountPosts.length);
  const avgEng = safeDiv(accountPosts.reduce((s, p) => s + engagement(p), 0), accountPosts.length);

  const hashtagInsights = analyzeHashtags(accountPosts);
  const timingInsights = analyzeTiming(accountPosts);
  const patterns = analyzePatterns(accountPosts);

  return {
    handle,
    brand,
    totalPosts: accountPosts.length,
    avgLikes: Math.round(avgLikes * 10) / 10,
    avgComments: Math.round(avgComments * 10) / 10,
    avgEngagement: Math.round(avgEng * 10) / 10,
    topHashtags: hashtagInsights.topPerforming.slice(0, 5).map((t) => ({ tag: t.tag, avgEngagement: t.avgEngagement, count: t.useCount })),
    bestPostingDays: timingInsights.bestDays.slice(0, 3).map((d) => d.day),
    bestPostingHours: timingInsights.bestHours.slice(0, 3).map((h) => h.hour),
    winningPatterns: patterns.winning.slice(0, 5),
    lessonsForUs: [],
  };
}

// ---------------------------------------------------------------------------
// Main intelligence generator
// ---------------------------------------------------------------------------

export function generateIntelligenceReport(
  ownPosts: ScrapedPost[],
  competitorPosts: ScrapedPost[],
): IntelligenceReport {
  // Analyze our own posts
  const ownAvgEng = safeDiv(ownPosts.reduce((s, p) => s + engagement(p), 0), ownPosts.length);
  const ownPatterns = analyzePatterns(ownPosts);
  const ownTiming = analyzeTiming(ownPosts);
  const ownHashtags = analyzeHashtags(ownPosts);
  const ownCaptions = analyzeCaptions(ownPosts);

  // Analyze each competitor
  const competitorHandles = [...new Set(competitorPosts.map((p) => p.accountHandle))];
  const benchmarks = competitorHandles.map((handle) => {
    const brand = competitorPosts.find((p) => p.accountHandle === handle)?.brand ?? 'affectly';
    return analyzeCompetitor(competitorPosts, handle, brand);
  });

  // Compare and generate lessons from competitors
  for (const bench of benchmarks) {
    const lessons: string[] = [];
    if (bench.avgEngagement > ownAvgEng * 2) {
      lessons.push(`@${bench.handle} gets ${bench.avgEngagement.toFixed(1)} avg engagement vs your ${ownAvgEng.toFixed(1)} — study their top posts`);
    }
    for (const wp of bench.winningPatterns) {
      const ours = ownPatterns.winning.find((p) => p.pattern === wp.pattern);
      if (!ours) {
        lessons.push(`They use "${wp.pattern}" effectively (${wp.avgEngagement.toFixed(1)} avg eng) — you don't use this pattern yet`);
      }
    }
    bench.lessonsForUs = lessons.slice(0, 3);
  }

  // Generate actionable insights
  const insights: ContentInsight[] = [];

  // Insight: winning patterns we should keep doing
  for (const wp of ownPatterns.winning.slice(0, 3)) {
    insights.push({
      category: 'content',
      priority: 'high',
      title: `Keep using: "${wp.pattern}"`,
      description: `Posts with this pattern get ${wp.avgEngagement.toFixed(1)} avg engagement (${wp.count} posts).`,
      action: `Continue this approach — it's working well for your audience.`,
      dataPoints: [`${wp.count} posts matched`, `${wp.avgEngagement.toFixed(1)} avg engagement`],
    });
  }

  // Insight: losing patterns we should stop
  for (const lp of ownPatterns.losing.slice(0, 2)) {
    insights.push({
      category: 'content',
      priority: 'high',
      title: `Stop: "${lp.pattern}"`,
      description: `Posts with this pattern only get ${lp.avgEngagement.toFixed(1)} avg engagement (${lp.count} posts).`,
      action: `This approach underperforms — try a different angle.`,
      dataPoints: [`${lp.count} posts matched`, `${lp.avgEngagement.toFixed(1)} avg engagement`],
    });
  }

  // Insight: competitor patterns we should steal
  const compPatterns = analyzePatterns(competitorPosts);
  for (const wp of compPatterns.winning.slice(0, 3)) {
    const ownUses = ownPatterns.winning.find((p) => p.pattern === wp.pattern);
    if (!ownUses) {
      insights.push({
        category: 'competitor',
        priority: 'medium',
        title: `Steal from competitors: "${wp.pattern}"`,
        description: `Competitors get ${wp.avgEngagement.toFixed(1)} avg engagement with this pattern but you rarely use it.`,
        action: `Try incorporating "${wp.pattern}" into your next 5 posts.`,
        dataPoints: [`Used by competitors in ${wp.count} posts`, `${wp.avgEngagement.toFixed(1)} avg engagement`],
      });
    }
  }

  // Insight: timing opportunities
  if (ownTiming.bestDays.length > 0) {
    insights.push({
      category: 'timing',
      priority: 'medium',
      title: `Best posting days: ${ownTiming.bestDays.slice(0, 2).map((d) => d.day).join(', ')}`,
      description: `Your top days get ${ownTiming.bestDays[0].avgEngagement.toFixed(1)} avg engagement.`,
      action: `Prioritize posting on these days for maximum engagement.`,
      dataPoints: ownTiming.bestDays.slice(0, 3).map((d) => `${d.day}: ${d.avgEngagement.toFixed(1)} avg`),
    });
  }

  // Insight: hashtag strategy
  if (ownHashtags.topPerforming.length > 0) {
    insights.push({
      category: 'hashtags',
      priority: 'medium',
      title: `Top hashtags: ${ownHashtags.topPerforming.slice(0, 3).map((t) => t.tag).join(', ')}`,
      description: `These tags correlate with higher engagement. Optimal count: ${ownHashtags.optimalCount} per post.`,
      action: `Use these high-performing hashtags more consistently.`,
      dataPoints: ownHashtags.topPerforming.slice(0, 5).map((t) => `${t.tag}: ${t.avgEngagement.toFixed(1)} avg eng (${t.useCount}x used)`),
    });
  }

  // Insight: caption length
  insights.push({
    category: 'content',
    priority: 'low',
    title: `Optimal caption length: ${ownCaptions.bestLengthRange} characters`,
    description: `Captions in this range perform best. Your average is ${ownCaptions.avgLength} characters.`,
    action: ownCaptions.avgLength > 500
      ? 'Consider trimming captions slightly for better engagement.'
      : 'Your caption length is in a good range — keep it up.',
    dataPoints: [`Best range: ${ownCaptions.bestLengthRange}`, `Your average: ${ownCaptions.avgLength} chars`],
  });

  // Build action plan from top insights
  const actionPlan = insights
    .filter((i) => i.priority === 'high' || i.priority === 'medium')
    .slice(0, 5)
    .map((i) => ({
      title: i.title,
      description: i.action,
      basedOn: i.dataPoints[0] || i.description,
    }));

  return {
    generatedAt: new Date().toISOString(),
    ownPerformance: {
      totalPosts: ownPosts.length,
      avgEngagement: Math.round(ownAvgEng * 10) / 10,
      winningPatterns: ownPatterns.winning,
      losingPatterns: ownPatterns.losing,
      timingInsights: ownTiming,
      hashtagInsights: ownHashtags,
      captionInsights: ownCaptions,
    },
    competitorBenchmarks: benchmarks.sort((a, b) => b.avgEngagement - a.avgEngagement),
    insights: insights.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    }),
    actionPlan,
  };
}
