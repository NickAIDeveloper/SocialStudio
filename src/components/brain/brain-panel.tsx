'use client';
import { useEffect, useState } from 'react';

interface Props { brandId: string; }

interface BrainResponse {
  brain: { briefVersion: number; generatedAt: string; briefMd: string; lastRunStatus: string; ingestedSources: Record<string, string> } | null;
  recent: { source: string; capturedAt: string }[];
}

export function BrainPanel({ brandId }: Props) {
  const [data, setData] = useState<BrainResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/brain?brandId=${brandId}`);
    if (!r.ok) { setError(`failed: ${r.status}`); return; }
    setData(await r.json());
  }

  useEffect(() => { load(); }, [brandId]);

  async function runNow() {
    setRunning(true); setError(null);
    try {
      const r = await fetch(`/api/brain/trigger?brandId=${brandId}`, { method: 'POST' });
      if (!r.ok) throw new Error(`trigger ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!data) return <div className="text-sm text-neutral-500">Loading brain…</div>;
  if (!data.brain) {
    return (
      <div className="border rounded-lg p-6 bg-neutral-50">
        <div className="font-medium mb-2">🧠 Brand Brain</div>
        <p className="text-sm text-neutral-600 mb-3">No brain yet for this brand.</p>
        <button onClick={runNow} disabled={running} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50">
          {running ? 'Running…' : 'Run now'}
        </button>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      </div>
    );
  }

  const sources = data.brain.ingestedSources ?? {};
  return (
    <div className="border rounded-lg p-6 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">🧠 Brand Brain · v{data.brain.briefVersion}</div>
        <button onClick={runNow} disabled={running} className="text-sm px-3 py-1 rounded border disabled:opacity-50">
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
      <div className="text-xs text-neutral-500 mb-4">
        Sources: {(['ig', 'ads', 'competitor_account'] as const).map((s) => (
          <span key={s} className="mr-3">
            {sources[s] === 'ok' ? '✓' : sources[s]?.startsWith('skipped') ? '—' : '⚠'} {s}
          </span>
        ))}
      </div>
      <pre className="whitespace-pre-wrap text-sm font-sans">{data.brain.briefMd}</pre>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  );
}
