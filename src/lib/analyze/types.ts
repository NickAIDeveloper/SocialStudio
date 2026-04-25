// src/lib/analyze/types.ts
import type { InsightCard } from '@/lib/health-score';
import type { DeepProfile } from '@/lib/meta/deep-profile.types';

export type AnalysisStepId =
  | 'analytics'
  | 'competitors'
  | 'deep-profile'
  | 'health-delta';

export type AnalysisStepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'skipped'
  | 'error';

export interface AnalysisStep {
  id: AnalysisStepId;
  label: string;
  status: AnalysisStepStatus;
  durationMs?: number;
  error?: string;
}

export interface AnalysisOpts {
  userId: string;
  brandId: string | null;
  igUserId: string | null;
  origin: string;
  cookie: string;
}

export interface AnalysisDeps {
  fetchAnalyticsInsights: (
    brandId: string | null,
  ) => Promise<{
    insights: InsightCard[];
    healthScore: number | null;
    summary: string | null;
  }>;
  fetchCompetitorInsights: () => Promise<{ insights: InsightCard[] }>;
  fetchDeepProfile: (igUserId: string) => Promise<DeepProfile>;
  fetchHealthDelta: (
    brandId: string | null,
  ) => Promise<{ current: number | null; previous: number | null; delta: number | null }>;
}

export interface AnalysisResult {
  generatedAt: string;
  brandId: string | null;
  igUserId: string | null;
  steps: AnalysisStep[];
  healthScore: number | null;
  healthDelta: number | null;
  summary: string | null;
  analyticsInsights: InsightCard[];
  competitorInsights: InsightCard[];
  deepProfile: DeepProfile | null;
}
