'use client';
import { useState } from 'react';

interface Props {
  brandId: string;
  caption: string;
  hookText: string;
  disabled?: boolean;
}

interface GradeReport {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  rationale?: string;
  brainAvailable?: boolean;
}

function scoreClasses(score: number): string {
  if (score >= 8) return 'text-(--success) bg-(--success)/10 border-(--success)/30';
  if (score >= 6) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-red-400 bg-red-500/10 border-red-500/30';
}

export function BrainGradeButton({ brandId, caption, hookText, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<GradeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grade() {
    setLoading(true);
    setError(null);
    setReport(null);
    setOpen(true);
    try {
      const res = await fetch(`/api/brain/grade?brandId=${brandId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caption, hookText }),
      });
      if (!res.ok) {
        setError(`grade failed: ${res.status}`);
        return;
      }
      const data = (await res.json()) as GradeReport;
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={grade}
        disabled={disabled || (!caption && !hookText)}
        className="text-xs px-3 py-1.5 rounded border border-(--line-strong) bg-(--surface) text-(--txt) hover:bg-(--surface-2) disabled:opacity-50"
        title="Score this draft against your brand brain"
      >
        🧠 Check vs Brain
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-(--surface) border border-(--line) rounded-2xl max-w-lg w-full max-h-[85vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium text-(--txt)">Brain grade</div>
              <button
                onClick={() => setOpen(false)}
                className="text-(--muted-2) hover:text-(--txt)"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {loading && <div className="text-sm text-(--muted-2)">Grading…</div>}
            {error && <div className="text-sm text-red-400">{error}</div>}
            {report && (
              <div className="space-y-4">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded border text-sm font-medium ${scoreClasses(
                    report.score
                  )}`}
                >
                  Score: {report.score.toFixed(1)} / 10
                </div>
                {!report.brainAvailable && (
                  <div className="text-xs text-(--muted-2) italic">
                    No brand brain yet — graded against general best practices.
                  </div>
                )}
                {report.rationale && (
                  <div className="text-sm text-(--muted) italic">{report.rationale}</div>
                )}
                {report.strengths.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-(--success) mb-1">Strengths</div>
                    <ul className="text-sm text-(--txt) list-disc pl-5 space-y-1">
                      {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {report.weaknesses.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-red-400 mb-1">Weaknesses</div>
                    <ul className="text-sm text-(--txt) list-disc pl-5 space-y-1">
                      {report.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {report.suggestions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-(--muted) mb-1">Suggestions</div>
                    <ul className="text-sm text-(--txt) list-disc pl-5 space-y-1">
                      {report.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
