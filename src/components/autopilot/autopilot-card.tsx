'use client';
import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// BufferChannelPicker
// ---------------------------------------------------------------------------

interface ChannelEntry {
  id: string;
  name: string;
  service: string;
  organizationId: string;
  organizationName: string;
}

interface DefaultChannelData {
  connected: boolean;
  channels: ChannelEntry[];
  selected: { channelId: string; organizationId: string; channelName: string | null } | null;
  error?: string | null;
}

function BufferChannelPicker({ brandId, brandHint }: { brandId: string; brandHint: string }) {
  const [data, setData] = useState<DefaultChannelData | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/buffer/default-channel?brandId=${brandId}`);
    if (!res.ok) { setErr(`channels: ${res.status}`); return; }
    setData(await res.json());
  }

  useEffect(() => { load(); }, [brandId]);

  async function pick(c: { id: string; name: string; organizationId: string }) {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/buffer/default-channel?brandId=${brandId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId: c.id, organizationId: c.organizationId, channelName: c.name }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="text-xs text-zinc-500 mt-3">Loading Buffer channels…</div>;

  if (!data.connected) {
    return (
      <div className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-1.5">
        Buffer not connected. Go to <a href="/linked-accounts" className="underline">Linked Accounts</a> to connect it.
        Autopilot will save drafts until Buffer is set up.
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="mt-3 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">
        Failed to load channels: {data.error}
      </div>
    );
  }

  if (data.channels.length === 0) {
    return (
      <div className="mt-3 text-xs text-zinc-400">
        Buffer is connected but has no channels yet. Add one in Buffer first.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label className="text-xs text-zinc-400 mb-1 block">
        Buffer channel for {brandHint} (auto-publish target)
      </label>
      <select
        disabled={saving}
        value={data.selected?.channelId ?? ''}
        onChange={(e) => {
          const c = data.channels.find((x) => x.id === e.target.value);
          if (c) pick({ id: c.id, name: `${c.organizationName} · ${c.name} (${c.service})`, organizationId: c.organizationId });
        }}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>— pick a channel —</option>
        {data.channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.organizationName} · {c.name} ({c.service})
          </option>
        ))}
      </select>
      {data.selected && (
        <div className="text-xs text-emerald-400 mt-1">
          ✓ Posts will publish to {data.selected.channelName ?? data.selected.channelId}
        </div>
      )}
      {err && <div className="text-xs text-red-400 mt-1">{err}</div>}
    </div>
  );
}

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

      {s.enabled && s.mode === 'auto' && (
        <BufferChannelPicker brandId={brandId} brandHint={brandName} />
      )}

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
      <AutopilotQueue brandId={brandId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutopilotQueue
// ---------------------------------------------------------------------------

interface QueueItem {
  id: string;
  caption: string;
  hookText: string | null;
  hashtags: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  bufferPostId: string | null;
  sourceImageUrl: string | null;
  createdAt: string;
}

function statusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', classes: 'bg-teal-950/40 text-teal-300 border-teal-900/60' };
    case 'published':
      return { label: 'Published', classes: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/60' };
    case 'draft':
      return { label: 'Draft', classes: 'bg-zinc-900 text-zinc-300 border-zinc-700' };
    case 'failed':
      return { label: 'Failed', classes: 'bg-red-950/40 text-red-300 border-red-900/60' };
    default:
      return { label: status, classes: 'bg-zinc-900 text-zinc-300 border-zinc-700' };
  }
}

function relative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const ms = d.getTime() - Date.now();
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return `${ms > 0 ? 'in ' : ''}${minutes}m${ms > 0 ? '' : ' ago'}`;
  const hours = Math.round(abs / 3600000);
  if (hours < 48) return `${ms > 0 ? 'in ' : ''}${hours}h${ms > 0 ? '' : ' ago'}`;
  const days = Math.round(abs / 86400000);
  return `${ms > 0 ? 'in ' : ''}${days}d${ms > 0 ? '' : ' ago'}`;
}

function AutopilotQueue({ brandId }: { brandId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/autopilot/queue?brandId=${brandId}&limit=10`);
    if (!res.ok) { setErr(`queue ${res.status}`); return; }
    const data = (await res.json()) as { posts: QueueItem[] };
    setItems(data.posts);
  }

  useEffect(() => { if (open) load(); }, [open, brandId]);

  return (
    <div className="mt-4 border-t border-zinc-800/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-zinc-300 hover:text-white flex items-center gap-1"
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        Recent generated posts {items ? `(${items.length})` : ''}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {err && <div className="text-xs text-red-400">{err}</div>}
          {items === null && !err && <div className="text-xs text-zinc-500">Loading…</div>}
          {items && items.length === 0 && (
            <div className="text-xs text-zinc-500">
              No autopilot posts yet. They&apos;ll show up here after the next cron run.
            </div>
          )}
          {items && items.map((p) => {
            const badge = statusBadge(p.status);
            const when = p.scheduledAt ?? p.publishedAt ?? p.createdAt;
            return (
              <div key={p.id} className="flex gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2.5">
                {p.sourceImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.sourceImageUrl}
                    alt=""
                    className="w-14 h-14 rounded object-cover flex-shrink-0 bg-zinc-900"
                  />
                ) : (
                  <div className="w-14 h-14 rounded bg-zinc-900 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${badge.classes}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-zinc-500">{relative(when)}</span>
                    {p.bufferPostId && (
                      <span className="text-[10px] text-zinc-500" title={p.bufferPostId}>
                        Buffer ✓
                      </span>
                    )}
                  </div>
                  {p.hookText && (
                    <div className="text-xs font-medium text-white truncate">{p.hookText}</div>
                  )}
                  <div className="text-xs text-zinc-400 line-clamp-2">{p.caption}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
