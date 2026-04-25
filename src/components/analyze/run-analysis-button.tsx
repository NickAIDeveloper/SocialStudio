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
  pending: 'text-zinc-500',
  running: 'text-teal-300 animate-spin',
  success: 'text-emerald-400',
  skipped: 'text-zinc-500',
  error: 'text-rose-400',
} as const;

function StepRow({ step }: { step: AnalysisStep }) {
  const Icon = STEP_ICON[step.status];
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-300">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${STEP_COLOR[step.status]}`} />
      <span className="flex-1">{step.label}</span>
      {step.durationMs != null && step.status === 'success' && (
        <span className="text-zinc-500">{(step.durationMs / 1000).toFixed(1)}s</span>
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
    <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-900/20 to-zinc-900/50 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15">
          <Sparkles className="h-5 w-5 text-teal-300" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-white">Run Full Analysis</h2>
          <p className="mt-0.5 text-sm text-zinc-300">
            One-tap refresh of your insights, deep profile, competitor benchmarks, and health delta.
          </p>
        </div>
        <button
          onClick={() => void handleClick()}
          disabled={running}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {running ? 'Running...' : 'Run Full Analysis'}
        </button>
      </div>

      {state.status === 'success' && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-3">
          {state.result.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
          {state.result.summary && (
            <p className="mt-2 border-t border-zinc-800/60 pt-2 text-sm text-zinc-200">
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
