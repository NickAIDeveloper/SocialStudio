// src/components/analyze/run-analysis-button.tsx
'use client';

import { Sparkles, Loader2, CheckCircle2, AlertCircle, MinusCircle } from 'lucide-react';
import { useAnalysis } from '@/lib/analyze/use-analysis';
import type { AnalysisStep } from '@/lib/analyze/types';

interface RunAnalysisButtonProps {
  brandId: string | null;
  igUserId: string | null;
  onComplete?: (result: import('@/lib/analyze/types').AnalysisResult) => void;
}

const STEP_ICON = {
  pending: MinusCircle,
  running: Loader2,
  success: CheckCircle2,
  skipped: MinusCircle,
  error: AlertCircle,
} as const;

const STEP_COLOR = {
  pending: 'text-(--muted-2)',
  running: 'text-(--violet-bright) animate-spin',
  success: 'text-(--success)',
  skipped: 'text-(--muted-2)',
  error: 'text-rose-400',
} as const;

function StepRow({ step }: { step: AnalysisStep }) {
  const Icon = STEP_ICON[step.status];
  return (
    <div className="flex items-center gap-2 text-xs text-(--muted)">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${STEP_COLOR[step.status]}`} />
      <span className="flex-1">{step.label}</span>
      {step.durationMs != null && step.status === 'success' && (
        <span className="text-(--muted-2)">{(step.durationMs / 1000).toFixed(1)}s</span>
      )}
      {step.status === 'error' && step.error && (
        <span className="text-rose-400 truncate max-w-[200px]" title={step.error}>
          {step.error}
        </span>
      )}
    </div>
  );
}

export function RunAnalysisButton({ brandId, igUserId, onComplete }: RunAnalysisButtonProps) {
  const { state, run } = useAnalysis();
  const running = state.status === 'running';

  const handleClick = async () => {
    const result = await run({ brandId, igUserId });
    if (result && onComplete) onComplete(result);
  };

  return (
    <div className="rounded-2xl border border-(--violet-24) bg-gradient-to-br from-(--violet-12) to-(--surface) p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--violet-12)">
          <Sparkles className="h-5 w-5 text-(--violet-bright)" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-(--txt)">Run Full Analysis</h2>
          <p className="mt-0.5 text-sm text-(--muted)">
            One-tap refresh of your insights, deep profile, competitor benchmarks, and health delta.
          </p>
        </div>
        <button
          onClick={() => void handleClick()}
          disabled={running}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-(--violet) px-4 py-2 text-sm font-semibold text-white hover:bg-(--violet-bright) disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? 'Running...' : 'Run Full Analysis'}
        </button>
      </div>

      {state.status === 'success' && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-(--line) bg-(--bg)/50 p-3">
          {state.result.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
          {state.result.summary && (
            <p className="mt-2 border-t border-(--line) pt-2 text-sm text-(--muted)">
              {state.result.summary}
            </p>
          )}
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" />
          {state.message}
        </div>
      )}
    </div>
  );
}
