'use client';
import { useEffect, useState } from 'react';

interface Props {
  brandId: string;
  brandName: string;
}

interface Settings {
  enabled: boolean;
  frequency: 'daily' | 'every_other_day' | 'three_per_week' | 'weekly';
  mode: 'queue' | 'auto';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  totalGenerated: number;
}

const FREQ_LABELS: Record<Settings['frequency'], string> = {
  daily: 'Daily',
  every_other_day: 'Every other day',
  three_per_week: '3× per week',
  weekly: 'Weekly',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function AutopilotCard({ brandId, brandName }: Props) {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/autopilot/settings?brandId=${brandId}`);
    if (!res.ok) { setErr(`load failed: ${res.status}`); return; }
    setS(await res.json());
  }

  useEffect(() => { load(); }, [brandId]);

  async function patch(update: Partial<Pick<Settings, 'enabled' | 'frequency' | 'mode'>>) {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/autopilot/settings?brandId=${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`patch ${res.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!s) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
        <div className="text-sm text-zinc-400">Loading autopilot…</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-medium text-white">🧠 Autopilot · {brandName}</div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Generate posts automatically using your brand brain.
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={s.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
            disabled={saving}
          />
          <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:bg-teal-600 transition-colors relative">
            <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform ${s.enabled ? 'translate-x-5' : ''}`} />
          </div>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Frequency</label>
          <select
            value={s.frequency}
            disabled={!s.enabled || saving}
            onChange={(e) => patch({ frequency: e.target.value as Settings['frequency'] })}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
          >
            {(Object.keys(FREQ_LABELS) as Settings['frequency'][]).map((k) => (
              <option key={k} value={k}>{FREQ_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Mode</label>
          <select
            value={s.mode}
            disabled={!s.enabled || saving}
            onChange={(e) => patch({ mode: e.target.value as Settings['mode'] })}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
          >
            <option value="queue">Queue drafts (review before publish)</option>
            <option value="auto">Full auto (schedule directly to Buffer)</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-zinc-500">Status</div>
          <div className={`font-medium ${s.enabled ? 'text-emerald-400' : 'text-zinc-400'}`}>
            {s.enabled ? 'Active' : 'Paused'}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Last run</div>
          <div className="text-zinc-300">{fmtDate(s.lastRunAt)}</div>
        </div>
        <div>
          <div className="text-zinc-500">Next run</div>
          <div className="text-zinc-300">{fmtDate(s.nextRunAt)}</div>
        </div>
        <div>
          <div className="text-zinc-500">Total generated</div>
          <div className="text-zinc-300">{s.totalGenerated}</div>
        </div>
      </div>

      {s.lastError && (
        <div className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded px-2 py-1">
          Last error: {s.lastError}
        </div>
      )}
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      {s.mode === 'auto' && s.enabled && (
        <div className="mt-3 text-xs text-amber-400 bg-amber-950/20 border border-amber-900/50 rounded px-2 py-1">
          ⚠️ Full auto: posts will be scheduled to Buffer at the brain&apos;s best slot without review.
        </div>
      )}
    </div>
  );
}
