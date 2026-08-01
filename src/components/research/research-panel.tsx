'use client';

import { useEffect, useState } from 'react';

interface RankedPain {
  theme: string;
  mentions: number;
  trusted: boolean;
  topQuote: string;
  quotes: string[];
}

interface ResearchData {
  researched: boolean;
  source: string | null;
  discussionsScanned: number;
  fetchedAt: string | null;
  ranked: RankedPain[];
  minMentionsToTrust: number;
  sites: Array<{ key: string; label: string }>;
}

export function ResearchPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [data, setData] = useState<ResearchData | null>(null);
  const [site, setSite] = useState('fitness');
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/research/view?brandId=${brandId}`);
    if (!res.ok) { setErr(`Failed to load: ${res.status}`); return; }
    setData(await res.json());
  }

  useEffect(() => { load(); }, [brandId]);

  async function refresh() {
    if (running) return;
    setRunning(true);
    setErr(null);
    try {
      const res = await fetch(`/api/research/view?brandId=${brandId}&site=${site}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!data) {
    return <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5 text-sm text-(--muted)">Loading research…</div>;
  }

  const trusted = data.ranked.filter(p => p.trusted);
  const untrusted = data.ranked.filter(p => !p.trusted);

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium text-(--txt)">🔎 Audience research · {brandName}</div>
          <div className="text-xs text-(--muted-2) mt-0.5">
            What real people complain about, ranked by how many say it.
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={site}
            onChange={(e) => setSite(e.target.value)}
            className="select-field text-xs"
            aria-label="Community to mine"
          >
            {data.sites.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={running}
            className="rounded-lg bg-(--violet) hover:bg-(--violet-bright) disabled:bg-(--surface-2) disabled:text-(--muted-2) text-(--txt) text-xs font-medium px-3 py-1.5 transition-colors"
          >
            {running ? 'Researching…' : 'Run research'}
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">{err}</div>
      )}

      {!data.researched && !err && (
        <div className="mt-4 text-sm text-(--muted)">
          No research yet. Pick a community and run it — findings feed straight into caption and ad copy.
        </div>
      )}

      {data.researched && (
        <>
          <div className="mt-3 text-[11px] text-(--muted-2)">
            {data.discussionsScanned} discussions scanned from {data.source}
            {data.fetchedAt && ` · ${new Date(data.fetchedAt).toLocaleString()}`}
          </div>

          {trusted.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-(--muted) font-medium">
                Used in generation ({data.minMentionsToTrust}+ people)
              </div>
              {trusted.map(p => (
                <div key={p.theme} className="rounded-lg border border-(--success)/30 bg-(--success)/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-(--txt)">{p.theme}</span>
                    <span className="text-[10px] text-(--success)">{p.mentions} people</span>
                  </div>
                  <div className="mt-1 text-xs text-(--muted) italic">&ldquo;{p.topQuote}&rdquo;</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-xs text-amber-300 bg-amber-950/20 border border-amber-900/50 rounded px-2 py-1.5">
              Nothing has been mentioned by {data.minMentionsToTrust}+ people yet, so nothing is being fed into
              generation. That is deliberate — acting on a single complaint would chase noise.
            </div>
          )}

          {untrusted.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-(--muted-2) cursor-pointer">
                Also seen, too rare to act on ({untrusted.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {untrusted.map(p => (
                  <span key={p.theme} className="text-[10px] text-(--muted-2) border border-(--line) rounded px-1.5 py-0.5">
                    {p.theme} · {p.mentions}
                  </span>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
