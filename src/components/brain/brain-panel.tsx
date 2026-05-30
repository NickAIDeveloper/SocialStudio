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

  if (!data) return <div className="text-sm text-(--muted-2)">Loading brain…</div>;
  if (!data.brain) {
    return (
      <div className="border border-(--line) rounded-2xl p-6 bg-(--surface)">
        <div className="font-medium mb-2 text-(--txt)">🧠 Brand Brain</div>
        <p className="text-sm text-(--muted) mb-3">No brain yet for this brand.</p>
        <button onClick={runNow} disabled={running} className="px-3 py-1.5 rounded bg-(--violet) text-white text-sm disabled:opacity-50">
          {running ? 'Running…' : 'Run now'}
        </button>
        {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      </div>
    );
  }

  const sources = data.brain.ingestedSources ?? {};
  return (
    <div className="border border-(--line) rounded-2xl p-6 bg-(--surface)">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium text-(--txt)">🧠 Brand Brain · v{data.brain.briefVersion}</div>
        <button onClick={runNow} disabled={running} className="text-sm px-3 py-1 rounded border border-(--line-strong) text-(--txt) disabled:opacity-50">
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
      <div className="text-xs text-(--muted-2) mb-4">
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
