'use client';

import { useState } from 'react';
import { type MetricKey } from '@/lib/meta/ig-analytics';
import { type PostSummary } from './shared';

interface CaptionPattern {
  label: string;
  evidence: string;
  howToUse: string;
}

export function CaptionPatterns({
  posts,
  medians,
}: {
  posts: PostSummary[];
  medians: Record<MetricKey, number | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [patterns, setPatterns] = useState<CaptionPattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meta/instagram/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'patterns', posts, medians }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || `HTTP ${res.status}`);
      // Defense in depth: the server now returns 502 on LLM parse failure,
      // but if a valid JSON response arrives with the wrong shape, surface
      // that as an AI error instead of showing "no patterns — post more"
      // and blaming the user for the LLM's gibberish.
      const raw = json.data?.patterns as { patterns?: CaptionPattern[] } | null;
      if (!raw || !Array.isArray(raw.patterns)) {
        throw new Error('AI returned an unexpected format. Please try again.');
      }
      setPatterns(raw.patterns);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-white">Caption patterns</h4>
          <p className="text-xs text-white/60 mt-0.5">
            AI analyzes your top 10 posts to extract what&apos;s repeatable.
          </p>
        </div>
        {!loaded && (
          <button
            onClick={analyze}
            disabled={loading}
            className="shrink-0 rounded-lg bg-fuchsia-500/20 border border-fuchsia-400/30 text-fuchsia-200 px-3 py-1.5 text-xs font-medium hover:bg-fuchsia-500/30 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Find my patterns'}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-rose-300/80">{error}</div>}
      {patterns && patterns.length > 0 && (
        <ul className="space-y-2">
          {patterns.map((p, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-semibold text-white">{p.label}</div>
              <div className="text-xs text-white/60 mt-1 italic">{p.evidence}</div>
              <div className="text-xs text-emerald-200/90 mt-1">→ {p.howToUse}</div>
            </li>
          ))}
        </ul>
      )}
      {loaded && patterns && patterns.length === 0 && (
        <div className="text-xs text-white/50">No clear patterns yet — post more and try again.</div>
      )}
    </div>
  );
}
