export interface InsightCard {
  id: string;
  priority: number;
  type: string;
  icon: string;
  title: string;
  verdict: 'positive' | 'negative' | 'opportunity';
  summary: string;
  action: string;
  data: Record<string, unknown>;
}

export interface PostData {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  impressions: number;
  hashtags: string[];
  contentType: string;
  postedAt: Date;
  brand: string;
}

export interface CompetitorPostData {
  handle: string;
  caption: string;
  likes: number;
  comments: number;
  hashtags: string[];
  postedAt: Date;
  isVideo: boolean;
}

export interface HealthScoreInput {
  avgEngagementRate: number;
  nicheAvgEngagementRate: number;
  postsLast4Weeks: number;
  targetPostsPerWeek: number;
  thisWeeksEngagement: number;
  prevWeeksEngagement: number;
  uniqueContentTypes: number;
  totalContentTypes: number;
}

export function calculateHealthScore(input: HealthScoreInput): number {
  const engagementScore = input.nicheAvgEngagementRate > 0
    ? Math.min(40, (input.avgEngagementRate / input.nicheAvgEngagementRate) * 40)
    : 20;

  const targetPosts = input.targetPostsPerWeek * 4;
  const consistencyScore = Math.min(25, (input.postsLast4Weeks / Math.max(1, targetPosts)) * 25);

  let trendScore = 10;
  if (input.prevWeeksEngagement > 0) {
    const change = (input.thisWeeksEngagement / input.prevWeeksEngagement) - 1;
    trendScore = Math.min(20, Math.max(0, 10 + change * 50));
  }

  const varietyScore = input.totalContentTypes > 0
    ? (input.uniqueContentTypes / input.totalContentTypes) * 15
    : 7.5;

  return Math.round(Math.max(0, Math.min(100, engagementScore + consistencyScore + trendScore + varietyScore)));
}

export function getHealthVerdict(score: number): { color: 'red' | 'amber' | 'green'; label: string } {
  if (score >= 70) return { color: 'green', label: 'Strong' };
  if (score >= 40) return { color: 'amber', label: 'Needs attention' };
  return { color: 'red', label: 'Needs work' };
}

// ---------------------------------------------------------------------------
// Engagement rate tier benchmarks (industry standard 2026)
// ---------------------------------------------------------------------------

export function getEngagementTier(followers: number): { name: string; avg: number } {
  if (followers < 5000) return { name: '1K\u20135K (Nano)', avg: 3.0 };
  if (followers < 20000) return { name: '5K\u201320K (Micro)', avg: 2.5 };
  if (followers < 200000) return { name: '20K\u2013200K (Mid)', avg: 2.15 };
  if (followers < 1000000) return { name: '200K\u20131M (Macro)', avg: 1.5 };
  return { name: '1M+ (Mega)', avg: 0.24 };
}

export function getCompetitiveGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

export function getHealthSummary(score: number, insights: InsightCard[]): string {
  const topInsight = insights[0];
  const verdict = getHealthVerdict(score);
  if (!topInsight) return `Your account health is ${verdict.label.toLowerCase()}.`;

  if (verdict.color === 'green') {
    return `You're outperforming most accounts in your niche. ${topInsight.action}`;
  }
  if (verdict.color === 'amber') {
    return `Your content quality is decent but there's room to grow. ${topInsight.action}`;
  }
  return `Your account needs attention. Focus on: ${topInsight.action}`;
}
