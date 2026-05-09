export type BrainSource = 'ig' | 'ads' | 'competitor_account';

export type RunStatus = 'ok' | 'partial' | 'failed' | 'skipped_no_connection';

export type SourceStatus =
  | 'ok'
  | 'partial'
  | 'failed'
  | 'skipped_no_connection'
  | 'skipped_no_campaigns';

export interface IngestedSources {
  ig: SourceStatus;
  ads: SourceStatus;
  competitor_account: SourceStatus;
}

export type IgFormat = 'REEL' | 'CAROUSEL' | 'IMAGE';
export type EmojiDensity = 'low' | 'medium' | 'high';

export interface CaptionShape {
  avgLines: number;
  avgParagraphs: number;
  emojiDensity: EmojiDensity;
  hookToBodyRatio: number;
}

export interface HookPattern {
  pattern: string;
  sampleSize: number;
  medianReach: number;
}

export interface TopicCluster {
  topic: string;
  sampleSize: number;
  medianEngagement: number;
}

export interface CompetitorSummary {
  // Account-level only in v1.
  totalCompetitors: number;
  followerGrowthMedian: number | null;
  postsPerWeekMedian: number | null;
}

export interface SnapshotResponse {
  status: 'ok' | 'partial' | 'skipped' | 'failed';
  reason?: string;
  sampleSize?: number;
}

export interface BrainFormula {
  format: IgFormat;
  bestSlot: { dow: number; hour: number };
  captionShape: { lines: number; paragraphs: number; emojiDensity: EmojiDensity };
}

export interface BrainContext {
  briefMd: string;
  formula: BrainFormula | null;
  briefVersion: number;
  generatedAt: string;
}
