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
      <AutopilotQueue brandId={brandId} brandName={brandName} />
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
  processedImageUrl: string | null;
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

function AutopilotQueue({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [preview, setPreview] = useState<QueueItem | null>(null);

  async function load() {
    setErr(null);
    const res = await fetch(`/api/autopilot/queue?brandId=${brandId}&limit=24`);
    if (!res.ok) { setErr(`queue ${res.status}`); return; }
    const data = (await res.json()) as { posts: QueueItem[] };
    setItems(data.posts);
  }

  async function clearAll() {
    if (!items || items.length === 0) return;
    const ok = window.confirm(
      `Delete all ${items.length} autopilot post${items.length === 1 ? '' : 's'} for this brand? This wipes the local listing and the no-reuse image set. Posts already published to Buffer or Instagram are untouched.`,
    );
    if (!ok) return;
    setClearing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/autopilot/queue?brandId=${brandId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`clear ${res.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  }

  async function scheduleOne(postId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await fetch(`/api/autopilot/schedule?postId=${postId}`, { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      return { ok: false, message: body.message ?? body.error ?? `HTTP ${res.status}` };
    }
    await load();
    return { ok: true };
  }

  async function deleteOne(postId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const res = await fetch(`/api/autopilot/queue?postId=${postId}`, { method: 'DELETE' });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      return { ok: false, message: body.message ?? body.error ?? `HTTP ${res.status}` };
    }
    await load();
    return { ok: true };
  }

  useEffect(() => { if (open) load(); }, [open, brandId]);

  return (
    <div className="mt-4 border-t border-zinc-800/60 pt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-zinc-300 hover:text-white flex items-center gap-1"
        >
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          Recent generated posts {items ? `(${items.length})` : ''}
        </button>
        {open && items && items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={clearing}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {clearing ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3">
          {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
          {items === null && !err && <div className="text-xs text-zinc-500">Loading…</div>}
          {items && items.length === 0 && (
            <div className="text-xs text-zinc-500">
              No autopilot posts yet. They&apos;ll show up here after the next cron run.
            </div>
          )}
          {items && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((p) => {
                const badge = statusBadge(p.status);
                const when = p.scheduledAt ?? p.publishedAt ?? p.createdAt;
                // Prefer the composited image (with hook overlay + brand logo)
                // when present; fall back to the raw stock photo.
                const thumb = p.processedImageUrl ?? p.sourceImageUrl;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setPreview(p)}
                    className="text-left rounded-lg border border-zinc-800/60 bg-zinc-950/40 overflow-hidden flex flex-col hover:border-zinc-700 hover:bg-zinc-900/40 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="w-full aspect-square object-cover bg-zinc-900"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-zinc-900" />
                    )}
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${badge.classes}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-zinc-500">{relative(when)}</span>
                        {p.bufferPostId && (
                          <span className="text-[10px] text-zinc-500" title={p.bufferPostId}>
                            Buffer ✓
                          </span>
                        )}
                      </div>
                      {p.hookText && (
                        <div className="text-xs font-medium text-white line-clamp-2">{p.hookText}</div>
                      )}
                      <div className="text-[11px] text-zinc-400 line-clamp-3 whitespace-pre-line">
                        {p.caption}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <PostPreviewModal
        key={preview?.id ?? 'closed'}
        post={preview}
        brandName={brandName}
        onClose={() => setPreview(null)}
        onSchedule={async (postId) => {
          const result = await scheduleOne(postId);
          if (result.ok) setPreview(null);
          return result;
        }}
        onDelete={async (postId) => {
          const result = await deleteOne(postId);
          if (result.ok) setPreview(null);
          return result;
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostPreviewModal — Instagram-style preview of an autopilot-generated post.
// Shows what the post will look like once it publishes: composited image,
// caption with paragraph breaks intact, hashtags, status/timing meta.
// ---------------------------------------------------------------------------

type PreviewActionResult = { ok: true } | { ok: false; message: string };

function PostPreviewModal({
  post,
  brandName,
  onClose,
  onSchedule,
  onDelete,
}: {
  post: QueueItem | null;
  brandName: string;
  onClose: () => void;
  onSchedule: (postId: string) => Promise<PreviewActionResult>;
  onDelete: (postId: string) => Promise<PreviewActionResult>;
}) {
  // Note: AutopilotQueue mounts this with a `key={post?.id}` so the component
  // remounts (and state resets) cleanly when the selected post changes — no
  // setState-in-effect reset needed.
  const [busy, setBusy] = useState<'schedule' | 'delete' | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // Close on Escape — base UI dialog handles this, but the modal here is a
  // light-weight overlay so we wire it up directly.
  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [post, onClose]);

  if (!post) return null;

  const image = post.processedImageUrl ?? post.sourceImageUrl;
  const badge = statusBadge(post.status);
  const when = post.scheduledAt ?? post.publishedAt ?? post.createdAt;
  const handle = brandName.toLowerCase().replace(/\s+/g, '');
  const canSchedule = post.status === 'draft';

  async function handleSchedule() {
    if (!post || busy) return;
    setBusy('schedule');
    setActionErr(null);
    const result = await onSchedule(post.id);
    if (!result.ok) {
      setActionErr(result.message);
      setBusy(null);
    }
    // If ok, parent closes the modal — no need to reset busy.
  }

  async function handleDelete() {
    if (!post || busy) return;
    const ok = window.confirm(
      'Delete this draft? It will be removed from the listing and its image can be picked again. Anything already in Buffer is untouched.',
    );
    if (!ok) return;
    setBusy('delete');
    setActionErr(null);
    const result = await onDelete(post.id);
    if (!result.ok) {
      setActionErr(result.message);
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 supports-backdrop-filter:backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Instagram-style header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-yellow-500 p-0.5">
              <div className="w-full h-full rounded-full bg-zinc-950 flex items-center justify-center text-[11px] font-semibold text-white">
                {brandName.slice(0, 1).toUpperCase()}
              </div>
            </div>
            <div className="text-sm font-semibold text-white">{handle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-xl leading-none px-1"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        {/* Image */}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="w-full aspect-square object-cover bg-zinc-900" />
        ) : (
          <div className="w-full aspect-square bg-zinc-900 flex items-center justify-center text-xs text-zinc-600">
            no image
          </div>
        )}

        {/* Mock action row (visual only — no functionality) */}
        <div className="px-3 pt-3 flex items-center gap-4 text-white">
          <span aria-hidden className="text-xl">♡</span>
          <span aria-hidden className="text-xl">💬</span>
          <span aria-hidden className="text-xl">↗</span>
          <span aria-hidden className="ml-auto text-xl">⌒</span>
        </div>

        {/* Caption + hashtags */}
        <div className="px-3 py-3 text-sm text-white">
          <span className="font-semibold mr-2">{handle}</span>
          <span className="whitespace-pre-line text-zinc-100">{post.caption}</span>
          {post.hashtags && (
            <div className="mt-2 text-sky-400 whitespace-pre-line text-xs">{post.hashtags}</div>
          )}
        </div>

        {/* Status footer */}
        <div className="px-3 pb-3 border-t border-zinc-800 pt-2.5 flex items-center justify-between gap-2 text-xs text-zinc-500 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${badge.classes}`}>
              {badge.label}
            </span>
            <span>{relative(when)}</span>
            {post.bufferPostId && (
              <span title={post.bufferPostId}>Buffer ✓</span>
            )}
          </div>
          {post.hookText && (
            <span className="text-zinc-500" title="Hook (image overlay text)">
              Hook: <span className="text-zinc-300">{post.hookText}</span>
            </span>
          )}
        </div>

        {/* Action bar */}
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800 mt-0 flex flex-col gap-2">
          {actionErr && (
            <div className="text-[11px] text-red-400 bg-red-950/30 border border-red-900/50 rounded px-2 py-1">
              {actionErr}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSchedule}
              disabled={!canSchedule || busy !== null}
              title={canSchedule ? 'Push this draft to Buffer at the brain best slot' : `Post is "${post.status}" — nothing to schedule.`}
              className="flex-1 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-medium py-2 transition-colors"
            >
              {busy === 'schedule'
                ? 'Scheduling…'
                : canSchedule
                  ? 'Schedule to Buffer'
                  : post.status === 'scheduled'
                    ? 'Already scheduled'
                    : `Status: ${post.status}`}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy !== null}
              className="rounded-lg border border-zinc-700 hover:border-red-700 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-3 py-2 transition-colors"
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          <p className="text-[10px] text-zinc-500 leading-snug">
            {canSchedule
              ? 'Scheduling sends this post to your selected Buffer channel at the brain best slot (24h from now if no best slot yet).'
              : 'Once a post is scheduled, manage it from inside Buffer.'}
          </p>
        </div>
      </div>
    </div>
  );
}
