export type IgFormat = 'REEL' | 'CAROUSEL' | 'IMAGE';

export interface DeepProfile {
  igUserId: string;
  handle: string;
  followerCount: number | null;
  sampleSize: number;
  medians: {
    reach: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
  };
  formatPerformance: Array<{
    format: IgFormat;
    count: number;
    medianReach: number;
    medianSaves: number;
    medianShares: number;
    liftVsOverall: number;
  }>;
  hookPatterns: Array<{
    pattern: string;
    exampleCaptions: string[];
    avgReach: number;
    occurrences: number;
  }>;
  captionLengthSweetSpot: {
    shortMedian: number;
    mediumMedian: number;
    longMedian: number;
    winner: 'short' | 'medium' | 'long';
  };
  timing: {
    heatmap: Array<Array<number | null>>;
    bestSlots: Array<{ day: string; hour: number; medianReach: number }>;
    audienceOnlineHours?: Array<{ day: string; hour: number; activeRatio: number }>;
  };
  topicSignals: {
    winning: string[];
    losing: string[];
  };
  audience?: {
    topCountries: Array<{ code: string; share: number }>;
    topCities: Array<{ name: string; share: number }>;
    ageGenderMix: Array<{ bucket: string; share: number }>;
  };
}
