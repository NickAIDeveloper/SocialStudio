// src/lib/analyze/use-analysis.ts
'use client';

import { useCallback, useState } from 'react';
import type { AnalysisResult } from './types';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | { status: 'success'; result: AnalysisResult; finishedAt: number }
  | { status: 'error'; message: string };

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });

  const run = useCallback(
    async (opts: { brandId: string | null; igUserId: string | null }) => {
      setState({ status: 'running', startedAt: Date.now() });
      try {
        const res = await fetch('/api/analyze/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(opts),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        const result = (await res.json()) as AnalysisResult;
        setState({ status: 'success', result, finishedAt: Date.now() });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        setState({ status: 'error', message });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
