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

  if (!data) return <div className="text-xs text-(--muted-2) mt-3">Loading Buffer channels…</div>;

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
      <div className="mt-3 text-xs text-(--muted)">
        Buffer is connected but has no channels yet. Add one in Buffer first.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label className="text-xs text-(--muted) mb-1 block">
        Buffer channel for {brandHint} (auto-publish target)
      </label>
      <select
        disabled={saving}
        value={data.selected?.channelId ?? ''}
        onChange={(e) => {
          const c = data.channels.find((x) => x.id === e.target.value);
          if (c) pick({ id: c.id, name: `${c.organizationName} · ${c.name} (${c.service})`, organizationId: c.organizationId });
        }}
        className="w-full rounded-lg border border-(--line) bg-(--bg) px-3 py-1.5 text-sm text-(--txt) focus:border-(--violet) focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>— pick a channel —</option>
        {data.channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.organizationName} · {c.name} ({c.service})
          </option>
        ))}
      </select>
      {data.selected && (
        <div className="text-xs text-(--success) mt-1">
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
  // Live Buffer channel health. Non-null means posts either can't be scheduled
  // (severity 'error' — Buffer lost authorization) or won't publish until the
  // user acts (severity 'warning' — queue paused).
  channelIssue: { code: string; message: string; severity: 'error' | 'warning' } | null;
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
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  // Bumped on every successful manual run so AutopilotQueue reloads the
  // grid without the user having to collapse + re-expand it.
  const [queueRefresh, setQueueRefresh] = useState(0);

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

  async function runNow() {
    if (running) return;
    setRunning(true);
    setRunMsg(null);
    setErr(null);
    try {
      const res = await fetch(`/api/autopilot/run?brandId=${brandId}&force=1`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        reason?: string;
        warning?: string | null;
      };
      if (!res.ok) {
        throw new Error(body.reason ?? `HTTP ${res.status}`);
      }
      if (body.status === 'ok') {
        setRunMsg(body.warning ? `Generated · ${body.warning}` : 'Generated a new post.');
      } else {
        setRunMsg(`Skipped: ${body.reason ?? 'unknown'}`);
      }
      await load();
      setQueueRefresh((n) => n + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!s) {
    return (
      <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5">
        <div className="text-sm text-(--muted)">Loading autopilot…</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="min-w-0">
          <div className="font-medium text-(--txt)">🧠 Autopilot · {brandName}</div>
          <div className="text-xs text-(--muted-2) mt-0.5">
            Generate posts automatically using your brand brain.
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={runNow}
            disabled={running}
            title="Generate one post right now (ignores schedule and paused state)"
            className="rounded-lg border border-(--violet)/60 hover:border-(--violet-bright) bg-(--violet-12) hover:bg-(--violet-24) text-(--violet-bright) hover:text-(--txt) disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium px-2.5 py-1 transition-colors"
          >
            {running ? 'Running…' : 'Run now'}
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={s.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              disabled={saving}
            />
            <div className="w-11 h-6 bg-(--surface-2) rounded-full peer peer-checked:bg-(--violet) transition-colors relative">
              <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform ${s.enabled ? 'translate-x-5' : ''}`} />
            </div>
          </label>
        </div>
      </div>
      {runMsg && (
        <div className="mb-3 text-xs text-(--violet-bright) bg-(--violet-12) border border-(--violet)/50 rounded px-2 py-1">
          {runMsg}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <div>
          <label className="text-xs text-(--muted) mb-1 block">Frequency</label>
          <select
            value={s.frequency}
            disabled={!s.enabled || saving}
            onChange={(e) => patch({ frequency: e.target.value as Settings['frequency'] })}
            className="w-full rounded-lg border border-(--line) bg-(--bg) px-3 py-1.5 text-sm text-(--txt) focus:border-(--violet) focus:outline-none disabled:opacity-50"
          >
            {(Object.keys(FREQ_LABELS) as Settings['frequency'][]).map((k) => (
              <option key={k} value={k}>{FREQ_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-(--muted) mb-1 block">Mode</label>
          <select
            value={s.mode}
            disabled={!s.enabled || saving}
            onChange={(e) => patch({ mode: e.target.value as Settings['mode'] })}
            className="w-full rounded-lg border border-(--line) bg-(--bg) px-3 py-1.5 text-sm text-(--txt) focus:border-(--violet) focus:outline-none disabled:opacity-50"
          >
            <option value="queue">Queue drafts (review before publish)</option>
            <option value="auto">Full auto (schedule directly to Buffer)</option>
          </select>
        </div>
      </div>

      {s.enabled && s.mode === 'auto' && (
        <BufferChannelPicker brandId={brandId} brandHint={brandName} />
      )}

      {/* Buffer holds its own Instagram credential per channel and it expires
          (~60 days). When it does, Buffer accepts posts and silently drops them
          at publish time, so this has to be loud and link straight to the fix. */}
      {s.channelIssue && (
        <div
          className={`mt-3 text-xs rounded px-3 py-2 border ${
            s.channelIssue.severity === 'error'
              ? 'text-red-300 bg-red-950/40 border-red-900/60'
              : 'text-amber-300 bg-amber-950/30 border-amber-900/60'
          }`}
        >
          <div className="font-medium">
            {s.channelIssue.severity === 'error'
              ? '⚠️ Buffer channel needs reconnecting'
              : '⏸️ Buffer queue paused'}
          </div>
          <div className="mt-1">{s.channelIssue.message}</div>
          <a
            href="https://buffer.com/channels"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block underline hover:no-underline"
          >
            Open Buffer channels →
          </a>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-(--muted-2)">Status</div>
          <div className={`font-medium ${s.enabled ? 'text-(--success)' : 'text-(--muted)'}`}>
            {s.enabled ? 'Active' : 'Paused'}
          </div>
        </div>
        <div>
          <div className="text-(--muted-2)">Last run</div>
          <div className="text-(--muted)">{fmtDate(s.lastRunAt)}</div>
        </div>
        <div>
          <div className="text-(--muted-2)">Next run</div>
          <div className="text-(--muted)">{fmtDate(s.nextRunAt)}</div>
        </div>
        <div>
          <div className="text-(--muted-2)">Total generated</div>
          <div className="text-(--muted)">{s.totalGenerated}</div>
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
      <AutopilotQueue brandId={brandId} brandName={brandName} refreshKey={queueRefresh} />
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
  // Buffer's own words for why a 'failed' post failed, e.g. "Buffer has lost
  // authorization to post on your behalf (Invalid Credentials)".
  failureReason: string | null;
}

function statusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'scheduled':
      return { label: 'Scheduled', classes: 'bg-(--cyan)/10 text-(--cyan) border-(--cyan)/30' };
    case 'published':
      return { label: 'Published', classes: 'bg-(--success)/10 text-(--success) border-(--success)/30' };
    case 'draft':
      return { label: 'Draft', classes: 'bg-(--surface) text-(--muted) border-(--line-strong)' };
    case 'failed':
      return { label: 'Failed', classes: 'bg-red-950/40 text-red-300 border-red-900/60' };
    default:
      return { label: status, classes: 'bg-(--surface) text-(--muted) border-(--line-strong)' };
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

function AutopilotQueue({
  brandId,
  brandName,
  refreshKey,
}: {
  brandId: string;
  brandName: string;
  /** Bumped by the parent after a manual run so the grid reloads even when the
   *  panel is already open. Also auto-opens the panel on first bump so the
   *  freshly generated post is visible without an extra click. */
  refreshKey: number;
}) {
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
  // After a manual run, auto-open the panel and reload so the new draft
  // appears without the user having to expand the section themselves.
  useEffect(() => {
    if (refreshKey === 0) return;
    setOpen(true);
    load();
  }, [refreshKey]);

  return (
    <div className="mt-4 border-t border-(--line) pt-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-(--muted) hover:text-(--txt) flex items-center gap-1"
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
          {items === null && !err && <div className="text-xs text-(--muted-2)">Loading…</div>}
          {items && items.length === 0 && (
            <div className="text-xs text-(--muted-2)">
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
                    className="text-left rounded-lg border border-(--line) bg-(--bg)/40 overflow-hidden flex flex-col hover:border-(--line-strong) hover:bg-(--surface)/40 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-(--violet)/50"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="w-full aspect-square object-cover bg-(--surface)"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-(--surface)" />
                    )}
                    <div className="p-2.5 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${badge.classes}`}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-(--muted-2)">{relative(when)}</span>
                        {p.bufferPostId && p.status !== 'failed' && (
                          <span className="text-[10px] text-(--muted-2)" title={p.bufferPostId}>
                            Buffer ✓
                          </span>
                        )}
                      </div>
                      {p.hookText && (
                        <div className="text-xs font-medium text-(--txt) line-clamp-2">{p.hookText}</div>
                      )}
                      {p.status === 'failed' && p.failureReason && (
                        <div className="text-[10px] text-red-300/90 line-clamp-2" title={p.failureReason}>
                          {p.failureReason}
                        </div>
                      )}
                      <div className="text-[11px] text-(--muted) line-clamp-3 whitespace-pre-line">
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
        className="bg-(--bg) border border-(--line) rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Instagram-style header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-(--line)">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-yellow-500 p-0.5">
              <div className="w-full h-full rounded-full bg-(--bg) flex items-center justify-center text-[11px] font-semibold text-(--txt)">
                {brandName.slice(0, 1).toUpperCase()}
              </div>
            </div>
            <div className="text-sm font-semibold text-(--txt)">{handle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-(--muted) hover:text-(--txt) text-xl leading-none px-1"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        {/* Image */}
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="w-full aspect-square object-cover bg-(--surface)" />
        ) : (
          <div className="w-full aspect-square bg-(--surface) flex items-center justify-center text-xs text-(--muted-2)">
            no image
          </div>
        )}

        {/* Mock action row (visual only — no functionality) */}
        <div className="px-3 pt-3 flex items-center gap-4 text-(--txt)">
          <span aria-hidden className="text-xl">♡</span>
          <span aria-hidden className="text-xl">💬</span>
          <span aria-hidden className="text-xl">↗</span>
          <span aria-hidden className="ml-auto text-xl">⌒</span>
        </div>

        {/* Caption + hashtags */}
        <div className="px-3 py-3 text-sm text-(--txt)">
          <span className="font-semibold mr-2">{handle}</span>
          <span className="whitespace-pre-line text-(--txt)">{post.caption}</span>
          {post.hashtags && (
            <div className="mt-2 text-(--cyan) whitespace-pre-line text-xs">{post.hashtags}</div>
          )}
        </div>

        {/* Status footer */}
        <div className="px-3 pb-3 border-t border-(--line) pt-2.5 flex items-center justify-between gap-2 text-xs text-(--muted-2) flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${badge.classes}`}>
              {badge.label}
            </span>
            <span>{relative(when)}</span>
            {post.bufferPostId && post.status !== 'failed' && (
              <span title={post.bufferPostId}>Buffer ✓</span>
            )}
          </div>
          {post.hookText && (
            <span className="text-(--muted-2)" title="Hook (image overlay text)">
              Hook: <span className="text-(--muted)">{post.hookText}</span>
            </span>
          )}
        </div>

        {post.status === 'failed' && post.failureReason && (
          <div className="mx-3 mb-3 text-[11px] text-red-300 bg-red-950/40 border border-red-900/60 rounded px-2 py-1.5">
            {post.failureReason}
          </div>
        )}

        {/* Action bar */}
        <div className="px-3 pb-3 pt-1 border-t border-(--line) mt-0 flex flex-col gap-2">
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
              className="flex-1 rounded-lg bg-(--violet) hover:bg-(--violet-bright) disabled:bg-(--surface-2) disabled:text-(--muted-2) disabled:cursor-not-allowed text-(--txt) text-sm font-medium py-2 transition-colors"
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
              className="rounded-lg border border-(--line-strong) hover:border-red-700 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-3 py-2 transition-colors"
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          <p className="text-[10px] text-(--muted-2) leading-snug">
            {canSchedule
              ? 'Scheduling sends this post to your selected Buffer channel at the brain best slot (24h from now if no best slot yet).'
              : 'Once a post is scheduled, manage it from inside Buffer.'}
          </p>
        </div>
      </div>
    </div>
  );
}
