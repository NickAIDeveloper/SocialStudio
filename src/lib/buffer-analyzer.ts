import type { BufferPostWithAnalytics } from '@/lib/buffer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BufferAnalysis {
  summary: {
    totalPosts: number;
    avgEngagementRate: number;
    totalReach: number;
    totalImpressions: number;
    totalLikes: number;
    totalComments: number;
    bestBrand: 'affectly' | 'pacebrain' | 'tied';
    trend: 'improving' | 'declining' | 'stable';
  };
  topPosts: {
    post: BufferPostWithAnalytics;
    rank: number;
    strengths: string[];
  }[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    evidence: string;
    action: string;
  }[];
  timing: {
    bestDay: string;
    bestHour: number;
    worstDay: string;
    topWindows: { day: string; hour: number; avgEngagement: number }[];
  };
  hashtags: {
    top: { tag: string; avgEngagement: number; useCount: number }[];
    optimalCount: number;
    overused: string[];
    underrated: string[];
  };
  contentPatterns: {
    avgCaptionLength: number;
    bestCaptionRange: string;
    topThemes: { theme: string; avgEngagement: number; count: number }[];
    savesToLikesRatio: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function engagementScore(post: BufferPostWithAnalytics, hasRealAnalytics: boolean): number {
  const s = post.statistics;
  if (hasRealAnalytics && s.reach > 0) {
    return (
      s.engagementRate * 0.4 +
      safeDiv(s.saves, s.reach) * 0.3 +
      safeDiv(s.shares, s.reach) * 0.2 +
      safeDiv(s.comments, s.reach) * 0.1
    );
  }
  return s.likes + s.comments * 2;
}

function engagementProxy(post: BufferPostWithAnalytics, hasRealAnalytics: boolean): number {
  if (hasRealAnalytics) return post.statistics.engagementRate;
  return post.statistics.likes + post.statistics.comments;
}

// ---------------------------------------------------------------------------
// Theme detection
// ---------------------------------------------------------------------------

const THEME_KEYWORDS: Record<string, string[]> = {
  'Mental Health': ['mental', 'anxiety', 'depression', 'therapy', 'wellness', 'healing', 'mindful'],
  'Self-Care': ['selfcare', 'self-care', 'rest', 'breathe', 'calm', 'relax', 'journal'],
  'Motivation': ['motivation', 'inspire', 'growth', 'goal', 'dream', 'achieve', 'never give up'],
  'Running Tips': ['pace', 'training', 'run', 'marathon', 'speed', 'endurance', 'strides'],
  'Community': ['community', 'tag someone', 'drop', 'share your', 'comment below', 'tell us'],
  'Product Update': ['new feature', 'update', 'launch', 'now available', 'introducing', 'syncs'],
  'Education': ['tip', 'how to', 'steps', 'guide', 'learn', 'research shows', 'swipe'],
};

function detectThemes(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      matched.push(theme);
    }
  }
  return matched.length > 0 ? matched : ['General'];
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

export function analyzeBufferPosts(posts: BufferPostWithAnalytics[]): BufferAnalysis {
  // Handle empty input
  if (posts.length === 0) {
    return {
      summary: {
        totalPosts: 0,
        avgEngagementRate: 0,
        totalReach: 0,
        totalImpressions: 0,
        totalLikes: 0,
        totalComments: 0,
        bestBrand: 'tied',
        trend: 'stable',
      },
      topPosts: [],
      recommendations: [],
      timing: { bestDay: 'Monday', bestHour: 9, worstDay: 'Sunday', topWindows: [] },
      hashtags: { top: [], optimalCount: 5, overused: [], underrated: [] },
      contentPatterns: { avgCaptionLength: 0, bestCaptionRange: '0-100', topThemes: [], savesToLikesRatio: 0 },
    };
  }

  const hasRealAnalytics = posts.some(p => p.statistics.reach > 0);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const totalReach = posts.reduce((s, p) => s + p.statistics.reach, 0);
  const totalImpressions = posts.reduce((s, p) => s + p.statistics.impressions, 0);
  const totalLikes = posts.reduce((s, p) => s + p.statistics.likes, 0);
  const totalComments = posts.reduce((s, p) => s + p.statistics.comments, 0);
  const avgEngagementRate = hasRealAnalytics
    ? safeDiv(posts.reduce((s, p) => s + p.statistics.engagementRate, 0), posts.length)
    : safeDiv(
        posts.reduce((s, p) => s + p.statistics.likes + p.statistics.comments, 0),
        posts.length
      );

  // Best brand
  const brandGroups: Record<string, BufferPostWithAnalytics[]> = {};
  for (const p of posts) {
    const arr = brandGroups[p.brand] || [];
    arr.push(p);
    brandGroups[p.brand] = arr;
  }
  let bestBrand: 'affectly' | 'pacebrain' | 'tied' = 'tied';
  const affectlyAvg = safeDiv(
    (brandGroups['affectly'] || []).reduce((s, p) => s + engagementProxy(p, hasRealAnalytics), 0),
    (brandGroups['affectly'] || []).length
  );
  const pacebrainAvg = safeDiv(
    (brandGroups['pacebrain'] || []).reduce((s, p) => s + engagementProxy(p, hasRealAnalytics), 0),
    (brandGroups['pacebrain'] || []).length
  );
  if (affectlyAvg > pacebrainAvg * 1.05) bestBrand = 'affectly';
  else if (pacebrainAvg > affectlyAvg * 1.05) bestBrand = 'pacebrain';

  // Trend: last 2 weeks vs previous 2 weeks
  const now = Date.now();
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;
  const recent = posts.filter(p => now - new Date(p.createdAt).getTime() < twoWeeks);
  const previous = posts.filter(p => {
    const age = now - new Date(p.createdAt).getTime();
    return age >= twoWeeks && age < twoWeeks * 2;
  });
  const recentAvg = safeDiv(
    recent.reduce((s, p) => s + engagementProxy(p, hasRealAnalytics), 0),
    recent.length
  );
  const previousAvg = safeDiv(
    previous.reduce((s, p) => s + engagementProxy(p, hasRealAnalytics), 0),
    previous.length
  );
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (previous.length > 0 && recent.length > 0) {
    const change = safeDiv(recentAvg - previousAvg, previousAvg);
    if (change > 0.1) trend = 'improving';
    else if (change < -0.1) trend = 'declining';
  }

  // -------------------------------------------------------------------------
  // Top posts
  // -------------------------------------------------------------------------
  const scored = posts.map(p => ({ post: p, score: engagementScore(p, hasRealAnalytics) }));
  scored.sort((a, b) => b.score - a.score);
  const avgLikes = safeDiv(totalLikes, posts.length);
  const avgComments = safeDiv(totalComments, posts.length);
  const avgSaves = safeDiv(posts.reduce((s, p) => s + p.statistics.saves, 0), posts.length);
  const avgShares = safeDiv(posts.reduce((s, p) => s + p.statistics.shares, 0), posts.length);

  const topPosts = scored.slice(0, 10).map((item, i) => {
    const s = item.post.statistics;
    const strengths: string[] = [];
    if (s.likes > avgLikes * 1.5) strengths.push('High likes');
    if (s.comments > avgComments * 1.5) strengths.push('High comments');
    if (s.saves > avgSaves * 1.5) strengths.push('High saves');
    if (s.shares > avgShares * 1.5) strengths.push('High shares');
    if (s.engagementRate > avgEngagementRate * 1.5) strengths.push('Strong engagement');
    if (item.post.hashtags.length >= 3 && item.post.hashtags.length <= 8) strengths.push('Good hashtag count');
    if (strengths.length === 0) strengths.push('Top performer');
    return { post: item.post, rank: i + 1, strengths };
  });

  // -------------------------------------------------------------------------
  // Timing
  // -------------------------------------------------------------------------
  const dayEngagement: Record<string, { total: number; count: number }> = {};
  const hourEngagement: Record<number, { total: number; count: number }> = {};
  const windowEngagement: Record<string, { day: string; hour: number; total: number; count: number }> = {};

  for (const p of posts) {
    const d = new Date(p.createdAt);
    const day = DAYS[d.getDay()];
    const hour = d.getHours();
    const eng = engagementProxy(p, hasRealAnalytics);

    const de = dayEngagement[day] || { total: 0, count: 0 };
    de.total += eng;
    de.count += 1;
    dayEngagement[day] = de;

    const he = hourEngagement[hour] || { total: 0, count: 0 };
    he.total += eng;
    he.count += 1;
    hourEngagement[hour] = he;

    const key = `${day}-${hour}`;
    const we = windowEngagement[key] || { day, hour, total: 0, count: 0 };
    we.total += eng;
    we.count += 1;
    windowEngagement[key] = we;
  }

  const dayRanked = Object.entries(dayEngagement)
    .map(([day, v]) => ({ day, avg: safeDiv(v.total, v.count) }))
    .sort((a, b) => b.avg - a.avg);
  const bestDay = dayRanked[0]?.day ?? 'Monday';
  const worstDay = dayRanked[dayRanked.length - 1]?.day ?? 'Sunday';

  const hourRanked = Object.entries(hourEngagement)
    .map(([h, v]) => ({ hour: Number(h), avg: safeDiv(v.total, v.count) }))
    .sort((a, b) => b.avg - a.avg);
  const bestHour = hourRanked[0]?.hour ?? 9;

  const topWindows = Object.values(windowEngagement)
    .map(w => ({ day: w.day, hour: w.hour, avgEngagement: safeDiv(w.total, w.count) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 5);

  // -------------------------------------------------------------------------
  // Hashtags
  // -------------------------------------------------------------------------
  const tagStats: Record<string, { totalEng: number; count: number }> = {};
  const hashtagCounts: Record<number, { totalEng: number; count: number }> = {};

  for (const p of posts) {
    const eng = engagementProxy(p, hasRealAnalytics);
    const count = p.hashtags.length;

    const hc = hashtagCounts[count] || { totalEng: 0, count: 0 };
    hc.totalEng += eng;
    hc.count += 1;
    hashtagCounts[count] = hc;

    for (const tag of p.hashtags) {
      const ts = tagStats[tag] || { totalEng: 0, count: 0 };
      ts.totalEng += eng;
      ts.count += 1;
      tagStats[tag] = ts;
    }
  }

  const topHashtags = Object.entries(tagStats)
    .map(([tag, v]) => ({ tag, avgEngagement: safeDiv(v.totalEng, v.count), useCount: v.count }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 15);

  const optimalCountEntry = Object.entries(hashtagCounts)
    .map(([c, v]) => ({ count: Number(c), avg: safeDiv(v.totalEng, v.count) }))
    .sort((a, b) => b.avg - a.avg);
  const optimalCount = optimalCountEntry[0]?.count ?? 5;

  const totalPostCount = posts.length;
  const avgHashtagEng = safeDiv(
    topHashtags.reduce((s, t) => s + t.avgEngagement, 0),
    topHashtags.length
  );
  const overused = Object.entries(tagStats)
    .filter(([, v]) => v.count > totalPostCount * 0.3 && safeDiv(v.totalEng, v.count) < avgHashtagEng)
    .map(([tag]) => tag);
  const underrated = Object.entries(tagStats)
    .filter(([, v]) => v.count < totalPostCount * 0.15 && v.count >= 2 && safeDiv(v.totalEng, v.count) > avgHashtagEng)
    .map(([tag]) => tag);

  // -------------------------------------------------------------------------
  // Content patterns
  // -------------------------------------------------------------------------
  const avgCaptionLength = safeDiv(
    posts.reduce((s, p) => s + p.captionLength, 0),
    posts.length
  );

  const captionBuckets: Record<string, { totalEng: number; count: number }> = {
    '0-50': { totalEng: 0, count: 0 },
    '51-100': { totalEng: 0, count: 0 },
    '101-150': { totalEng: 0, count: 0 },
    '151-200': { totalEng: 0, count: 0 },
    '200+': { totalEng: 0, count: 0 },
  };

  for (const p of posts) {
    const eng = engagementProxy(p, hasRealAnalytics);
    let bucket: string;
    if (p.captionLength <= 50) bucket = '0-50';
    else if (p.captionLength <= 100) bucket = '51-100';
    else if (p.captionLength <= 150) bucket = '101-150';
    else if (p.captionLength <= 200) bucket = '151-200';
    else bucket = '200+';
    captionBuckets[bucket].totalEng += eng;
    captionBuckets[bucket].count += 1;
  }

  const bestCaptionBucket = Object.entries(captionBuckets)
    .filter(([, v]) => v.count > 0)
    .map(([range, v]) => ({ range, avg: safeDiv(v.totalEng, v.count) }))
    .sort((a, b) => b.avg - a.avg);
  const bestCaptionRange = bestCaptionBucket[0]?.range ?? '101-150';

  // Themes
  const themeStats: Record<string, { totalEng: number; count: number }> = {};
  for (const p of posts) {
    const eng = engagementProxy(p, hasRealAnalytics);
    const themes = detectThemes(p.text);
    for (const theme of themes) {
      const ts = themeStats[theme] || { totalEng: 0, count: 0 };
      ts.totalEng += eng;
      ts.count += 1;
      themeStats[theme] = ts;
    }
  }
  const topThemes = Object.entries(themeStats)
    .map(([theme, v]) => ({ theme, avgEngagement: safeDiv(v.totalEng, v.count), count: v.count }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 5);

  const totalSaves = posts.reduce((s, p) => s + p.statistics.saves, 0);
  const savesToLikesRatio = safeDiv(totalSaves, totalLikes);

  // -------------------------------------------------------------------------
  // Recommendations
  // -------------------------------------------------------------------------
  const recommendations: BufferAnalysis['recommendations'] = [];

  // Brand comparison
  if (bestBrand !== 'tied' && brandGroups['affectly'] && brandGroups['pacebrain']) {
    const winner = bestBrand;
    const loser = bestBrand === 'affectly' ? 'pacebrain' : 'affectly';
    const winAvg = winner === 'affectly' ? affectlyAvg : pacebrainAvg;
    const loseAvg = winner === 'affectly' ? pacebrainAvg : affectlyAvg;
    recommendations.push({
      priority: 'high',
      category: 'Brand Strategy',
      title: `${winner} outperforms ${loser}`,
      description: `${winner} posts average ${winAvg.toFixed(1)} engagement vs ${loseAvg.toFixed(1)} for ${loser}.`,
      evidence: `Based on ${(brandGroups[winner] || []).length} ${winner} posts vs ${(brandGroups[loser] || []).length} ${loser} posts.`,
      action: `Study what makes ${winner} content resonate and apply those patterns to ${loser}.`,
    });
  }

  // Timing
  if (dayRanked.length >= 2) {
    recommendations.push({
      priority: 'high',
      category: 'Timing',
      title: `Post more on ${bestDay}`,
      description: `${bestDay} posts get ${dayRanked[0].avg.toFixed(1)} avg engagement, ${((dayRanked[0].avg / (dayRanked[dayRanked.length - 1].avg || 1) - 1) * 100).toFixed(0)}% more than ${worstDay}.`,
      evidence: `Analyzed posting times across ${posts.length} posts.`,
      action: `Shift more posts to ${bestDay} and reduce ${worstDay} posting.`,
    });
  }

  // Best hour
  if (hourRanked.length > 0) {
    const hourLabel = bestHour === 0 ? '12 AM' : bestHour < 12 ? `${bestHour} AM` : bestHour === 12 ? '12 PM' : `${bestHour - 12} PM`;
    recommendations.push({
      priority: 'medium',
      category: 'Timing',
      title: `Optimal posting time: ${hourLabel}`,
      description: `Posts around ${hourLabel} achieve the highest average engagement.`,
      evidence: `Hour ${bestHour}:00 has ${hourRanked[0].avg.toFixed(1)} avg engagement.`,
      action: `Schedule your key posts near ${hourLabel} for maximum visibility.`,
    });
  }

  // Hashtag count
  recommendations.push({
    priority: 'medium',
    category: 'Hashtags',
    title: `Use ${optimalCount} hashtags per post`,
    description: `Posts with ${optimalCount} hashtags perform best in your data.`,
    evidence: `Optimal count derived from ${posts.length} posts.`,
    action: `Aim for exactly ${optimalCount} well-chosen hashtags on each post.`,
  });

  // Caption length
  recommendations.push({
    priority: 'medium',
    category: 'Content',
    title: `Keep captions in the ${bestCaptionRange} character range`,
    description: `Captions of ${bestCaptionRange} characters drive the highest engagement.`,
    evidence: `Your average caption is ${Math.round(avgCaptionLength)} characters.`,
    action: `Edit captions to land in the ${bestCaptionRange} range for best results.`,
  });

  // Saves ratio
  if (savesToLikesRatio < 0.1) {
    recommendations.push({
      priority: 'medium',
      category: 'Content',
      title: 'Boost save-worthy content',
      description: `Your saves-to-likes ratio is ${(savesToLikesRatio * 100).toFixed(1)}%, which is low.`,
      evidence: `${totalSaves} saves vs ${totalLikes} likes across ${posts.length} posts.`,
      action: 'Create more educational, tip-based, or reference content that followers want to revisit.',
    });
  } else if (savesToLikesRatio > 0.3) {
    recommendations.push({
      priority: 'low',
      category: 'Content',
      title: 'Great save rate, keep it up',
      description: `Your saves-to-likes ratio is ${(savesToLikesRatio * 100).toFixed(1)}%, which is excellent.`,
      evidence: `${totalSaves} saves vs ${totalLikes} likes across ${posts.length} posts.`,
      action: 'Continue creating valuable, save-worthy content. Consider making it shareable too.',
    });
  }

  // Overused hashtags
  if (overused.length > 0) {
    recommendations.push({
      priority: 'low',
      category: 'Hashtags',
      title: 'Rotate overused hashtags',
      description: `${overused.slice(0, 3).join(', ')} appear in >30% of posts but underperform.`,
      evidence: `These tags have below-average engagement despite heavy use.`,
      action: 'Swap them for niche, high-performing alternatives.',
    });
  }

  // Trend
  if (trend === 'declining') {
    recommendations.push({
      priority: 'high',
      category: 'Strategy',
      title: 'Engagement is declining',
      description: 'Recent posts are underperforming compared to earlier ones.',
      evidence: `Last 2 weeks avg: ${recentAvg.toFixed(1)} vs previous 2 weeks: ${previousAvg.toFixed(1)}.`,
      action: 'Review your top-performing posts and replicate what worked. Experiment with new formats.',
    });
  }

  recommendations.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  return {
    summary: {
      totalPosts: posts.length,
      avgEngagementRate,
      totalReach,
      totalImpressions,
      totalLikes,
      totalComments,
      bestBrand,
      trend,
    },
    topPosts,
    recommendations,
    timing: { bestDay, bestHour, worstDay, topWindows },
    hashtags: { top: topHashtags, optimalCount, overused, underrated },
    contentPatterns: { avgCaptionLength: Math.round(avgCaptionLength), bestCaptionRange, topThemes, savesToLikesRatio },
  };
}
