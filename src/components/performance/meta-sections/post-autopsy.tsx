'use client';

import { useState } from 'react';
import { type MetricKey } from '@/lib/meta/ig-analytics';
import { type PostSummary } from './shared';

interface AutopsyAnalysis {
  verdict?: 'positive' | 'negative' | 'mixed';
  why?: string;
  fixes?: string[];
}

export function PostAutopsy({
  posts,
  medians,
}: {
  posts: PostSummary[];
  medians: Record<MetricKey, number | null>;
}) {
  const [selectedId, setSelectedId] = useState<string>(posts[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutopsyAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/meta/instagram/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'autopsy', posts, medians, postId: selectedId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult((json.data?.analysis as AutopsyAnalysis) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  const verdictColor =
    result?.verdict === 'positive'
      ? 'text-emerald-300'
      : result?.verdict === 'negative'
        ? 'text-rose-300'
        : 'text-amber-300';

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">Post autopsy</h4>
          <p className="text-xs text-white/60 mt-0.5">
            Pick a post → get a plain-English verdict + 3 concrete fixes.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <select
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setResult(null);
          }}
          className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white"
        >
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.caption?.slice(0, 60) || '(no caption)') + ` · ${p.format}`}
            </option>
          ))}
        </select>
        <button
          onClick={analyze}
          disabled={loading || !selectedId}
          className="shrink-0 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-200 px-3 py-1.5 text-xs font-medium hover:bg-sky-500/30 disabled:opacity-50"
        >
          {loading ? 'Autopsy…' : 'Analyze'}
        </button>
      </div>
      {error && <div className="text-xs text-rose-300/80">{error}</div>}
      {result && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
          {result.verdict && (
            <div className={`text-[11px] uppercase tracking-wider font-semibold ${verdictColor}`}>
              Verdict: {result.verdict}
            </div>
          )}
          {result.why && <p className="text-sm text-white/85">{result.why}</p>}
          {result.fixes && result.fixes.length > 0 && (
            <ul className="space-y-1 pl-4 list-disc text-xs text-white/75">
              {result.fixes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
