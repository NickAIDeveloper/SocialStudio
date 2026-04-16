'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Types ────────────────────────────────────────────────────────────────────

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  currency?: string;
  account_status?: number;
}

interface MetaAssets {
  adAccounts: AdAccount[];
  pages: Array<{
    id: string;
    name: string;
    category?: string;
    instagramBusinessAccountId: string | null;
  }>;
}

interface MetaAccount {
  fbUserId: string;
  fbUserName: string | null;
  scopes: string | null;
  assets: MetaAssets | null;
  selectedAdAccountId: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

interface InsightsRow {
  [k: string]: unknown;
  impressions?: string;
  reach?: string;
  spend?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  date_start?: string;
  date_stop?: string;
}

interface InsightsResponse {
  data: InsightsRow[];
}

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'maximum', label: 'Maximum' },
];

type InsightsLevel = 'account' | 'campaign' | 'adset' | 'ad';

const LEVELS: Array<{ value: InsightsLevel; label: string }> = [
  { value: 'account', label: 'Whole account' },
  { value: 'campaign', label: 'Per campaign' },
  { value: 'adset', label: 'Per ad set' },
  { value: 'ad', label: 'Per ad' },
];

// Breakdown options come from the Marketing API /insights reference. Only a
// safe subset is exposed — some combinations are invalid and Meta will reject
// them (e.g. mixing delivery + action breakdowns). Keep to well-supported ones.
const BREAKDOWNS: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'No breakdown' },
  { value: 'age', label: 'Age' },
  { value: 'gender', label: 'Gender' },
  { value: 'age,gender', label: 'Age + gender' },
  { value: 'country', label: 'Country' },
  { value: 'region', label: 'Region' },
  { value: 'publisher_platform', label: 'Platform' },
  { value: 'device_platform', label: 'Device' },
  { value: 'impression_device', label: 'Impression device' },
];

// ── Component ────────────────────────────────────────────────────────────────

export function MetaHub() {
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<MetaAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Insights state
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [datePreset, setDatePreset] = useState('last_30d');
  const [level, setLevel] = useState<InsightsLevel>('account');
  const [breakdown, setBreakdown] = useState<string>('none');

  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/meta/account', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAccount(json.data);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load account',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(
    async (adAccountId: string, preset: string) => {
      setInsightsLoading(true);
      try {
        const breakdownParam = breakdown !== 'none' ? `&breakdowns=${encodeURIComponent(breakdown)}` : '';
        const url = `/api/meta/insights?adAccountId=${encodeURIComponent(adAccountId)}&datePreset=${preset}&level=${level}${breakdownParam}`;
        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setInsights(json.data);
      } catch (err) {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to load insights',
        });
        setInsights(null);
      } finally {
        setInsightsLoading(false);
      }
    },
    [level, breakdown]
  );

  // Initial load + pick up redirect query params from OAuth callback
  useEffect(() => {
    const err = searchParams.get('error');
    const connected = searchParams.get('connected');
    if (err) setMessage({ type: 'error', text: err });
    else if (connected === '1') setMessage({ type: 'success', text: 'Facebook connected.' });
    fetchAccount();
  }, [fetchAccount, searchParams]);

  // Auto-fetch insights when account + selected ad account are available
  useEffect(() => {
    if (account?.selectedAdAccountId) {
      fetchInsights(account.selectedAdAccountId, datePreset);
    }
  }, [account?.selectedAdAccountId, datePreset, level, breakdown, fetchInsights]);

  async function handleDisconnect() {
    if (!confirm('Disconnect Facebook? You will need to re-authorize to pull insights again.')) {
      return;
    }
    try {
      const res = await fetch('/api/meta/account', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccount(null);
      setInsights(null);
      setMessage({ type: 'success', text: 'Disconnected.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Disconnect failed',
      });
    }
  }

  async function handleSelectAdAccount(adAccountId: string) {
    try {
      const res = await fetch('/api/meta/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAdAccountId: adAccountId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccount((prev) => (prev ? { ...prev, selectedAdAccountId: adAccountId } : prev));
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update selection',
      });
    }
  }

  if (loading) {
    return <div className="text-sm text-white/70">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={
            message.type === 'success'
              ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300'
              : 'rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400'
          }
        >
          {message.text}
        </div>
      )}

      <ConnectionCard account={account} onDisconnect={handleDisconnect} />

      {account && account.assets && (
        <AdAccountSelector
          adAccounts={account.assets.adAccounts}
          selectedId={account.selectedAdAccountId}
          onSelect={handleSelectAdAccount}
        />
      )}

      {account?.selectedAdAccountId && (
        <InsightsPanel
          insights={insights}
          loading={insightsLoading}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          level={level}
          onLevelChange={setLevel}
          breakdown={breakdown}
          onBreakdownChange={setBreakdown}
        />
      )}

      {account && account.assets && account.assets.pages.length > 0 && (
        <PagesPanel pages={account.assets.pages} />
      )}

      <FutureFeaturesPanel connected={!!account} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ConnectionCard({
  account,
  onDisconnect,
}: {
  account: MetaAccount | null;
  onDisconnect: () => void;
}) {
  if (!account) {
    return (
      <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Facebook not connected</h3>
          <p className="text-sm text-white mt-1">
            Authorize access to your Facebook ad accounts, Pages, and Instagram Business
            accounts to read performance insights.
          </p>
        </div>
        <a
          href="/api/meta/oauth/start"
          className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166FE5] transition-colors"
        >
          Connect Facebook
        </a>
      </div>
    );
  }

  const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Connected</h3>
          <p className="text-sm text-white mt-1">
            Authorized as <span className="font-medium">{account.fbUserName ?? account.fbUserId}</span>
          </p>
          {daysLeft != null && (
            <p className="text-xs text-white/60 mt-1">
              Access token expires in {daysLeft} day{daysLeft === 1 ? '' : 's'} — reconnect before then.
            </p>
          )}
        </div>
        <button
          onClick={onDisconnect}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5 transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

function AdAccountSelector({
  adAccounts,
  selectedId,
  onSelect,
}: {
  adAccounts: AdAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (adAccounts.length === 0) {
    return (
      <div className="glass-card rounded-xl border border-white/5 p-6">
        <h3 className="text-lg font-semibold text-white">No ad accounts found</h3>
        <p className="text-sm text-white/70 mt-1">
          The connected Facebook user doesn&apos;t have access to any ad accounts, or the
          <code className="mx-1 px-1 rounded bg-black/30">ads_read</code>
          permission was not granted. Try reconnecting.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-white">Ad account</h3>
        <p className="text-sm text-white/70 mt-1">
          Pick which ad account Insights should read from.
        </p>
      </div>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white"
      >
        {adAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.account_id}){a.currency ? ` · ${a.currency}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function InsightsPanel({
  insights,
  loading,
  datePreset,
  onDatePresetChange,
  level,
  onLevelChange,
  breakdown,
  onBreakdownChange,
}: {
  insights: InsightsResponse | null;
  loading: boolean;
  datePreset: string;
  onDatePresetChange: (v: string) => void;
  level: InsightsLevel;
  onLevelChange: (v: InsightsLevel) => void;
  breakdown: string;
  onBreakdownChange: (v: string) => void;
}) {
  const rows = insights?.data ?? [];
  // Single-row layout only makes sense for account-level with no breakdown.
  // Everything else returns N rows → render a table.
  const isSingleRow = level === 'account' && breakdown === 'none';
  const singleRow = rows[0];

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-white">Ad account insights</h3>
          <p className="text-sm text-white/70 mt-1">
            Slice by level and demographic breakdown — powered by Marketing API.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LabeledSelect
            label="Level"
            value={level}
            onChange={(v) => onLevelChange(v as InsightsLevel)}
            options={LEVELS}
          />
          <LabeledSelect
            label="Breakdown"
            value={breakdown}
            onChange={onBreakdownChange}
            options={BREAKDOWNS}
          />
          <LabeledSelect
            label="Date"
            value={datePreset}
            onChange={onDatePresetChange}
            options={DATE_PRESETS}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-white/60">Loading insights…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-white/60">
          No data for this range. Run some ads — then come back.
        </div>
      ) : isSingleRow && singleRow ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Impressions" value={formatNumber(singleRow.impressions)} />
          <Metric label="Reach" value={formatNumber(singleRow.reach)} />
          <Metric label="Spend" value={formatCurrency(singleRow.spend)} />
          <Metric label="Clicks" value={formatNumber(singleRow.clicks)} />
          <Metric label="CTR" value={formatPercent(singleRow.ctr)} />
          <Metric label="CPC" value={formatCurrency(singleRow.cpc)} />
          <Metric label="CPM" value={formatCurrency(singleRow.cpm)} />
          <Metric label="Frequency" value={formatDecimal(singleRow.frequency)} />
        </div>
      ) : (
        <InsightsTable rows={rows} level={level} breakdown={breakdown} />
      )}
    </div>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-white/50">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm text-white normal-case tracking-normal"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Columns shown for the row label depend on level + breakdown. When the user
// picks `level=campaign`, each row has a `campaign_name`; at `level=ad`, each
// has `ad_name`; etc. Breakdown keys (age, gender, country…) appear as extra
// columns mirroring whichever breakdown was chosen.
function InsightsTable({
  rows,
  level,
  breakdown,
}: {
  rows: InsightsRow[];
  level: InsightsLevel;
  breakdown: string;
}) {
  const labelKey =
    level === 'campaign'
      ? 'campaign_name'
      : level === 'adset'
        ? 'adset_name'
        : level === 'ad'
          ? 'ad_name'
          : null;
  const breakdownKeys = breakdown === 'none' ? [] : breakdown.split(',');

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-white/50 border-b border-white/10">
            {labelKey && <th className="px-2 py-2 font-medium">{labelFor(labelKey)}</th>}
            {breakdownKeys.map((k) => (
              <th key={k} className="px-2 py-2 font-medium">
                {labelFor(k)}
              </th>
            ))}
            <th className="px-2 py-2 font-medium text-right">Impr.</th>
            <th className="px-2 py-2 font-medium text-right">Reach</th>
            <th className="px-2 py-2 font-medium text-right">Spend</th>
            <th className="px-2 py-2 font-medium text-right">Clicks</th>
            <th className="px-2 py-2 font-medium text-right">CTR</th>
            <th className="px-2 py-2 font-medium text-right">CPC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${i}-${labelKey ? String(r[labelKey]) : ''}`}
              className="border-b border-white/5 text-white/90 hover:bg-white/5"
            >
              {labelKey && (
                <td className="px-2 py-2 max-w-[240px] truncate">
                  {String(r[labelKey] ?? '—')}
                </td>
              )}
              {breakdownKeys.map((k) => (
                <td key={k} className="px-2 py-2">
                  {String(r[k] ?? '—')}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.impressions)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.reach)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(r.spend)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(r.clicks)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatPercent(r.ctr)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(r.cpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function labelFor(key: string): string {
  const map: Record<string, string> = {
    campaign_name: 'Campaign',
    adset_name: 'Ad set',
    ad_name: 'Ad',
    age: 'Age',
    gender: 'Gender',
    country: 'Country',
    region: 'Region',
    publisher_platform: 'Platform',
    device_platform: 'Device',
    impression_device: 'Impression device',
  };
  return map[key] ?? key;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="text-lg font-semibold text-white mt-0.5">{value}</div>
    </div>
  );
}

function PagesPanel({
  pages,
}: {
  pages: Array<{
    id: string;
    name: string;
    category?: string;
    instagramBusinessAccountId: string | null;
  }>;
}) {
  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-3">
      <h3 className="text-lg font-semibold text-white">Pages &amp; Instagram accounts</h3>
      <ul className="space-y-1.5">
        {pages.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium text-white">{p.name}</div>
              {p.category && <div className="text-xs text-white/50">{p.category}</div>}
            </div>
            <div className="text-xs text-white/60">
              {p.instagramBusinessAccountId ? 'Instagram linked' : 'No Instagram'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FutureFeaturesPanel({ connected }: { connected: boolean }) {
  const items = [
    {
      title: 'Create & boost ads',
      desc: 'Turn Smart Posts into campaigns with targeting + budget.',
      scope: 'ads_management',
    },
    {
      title: 'Per-post Instagram insights',
      desc: 'Saves, follows-from-post, Reels retention curves.',
      scope: 'instagram_manage_insights',
    },
    {
      title: 'Audience demographics',
      desc: 'City / country / age / gender breakdowns.',
      scope: 'breakdowns on /insights',
    },
  ];
  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-3 opacity-80">
      <div>
        <h3 className="text-lg font-semibold text-white">Coming soon</h3>
        <p className="text-sm text-white/70 mt-1">
          {connected
            ? 'Additional features unlock after App Review approval for the scopes below.'
            : 'Connect Facebook first to see what else is possible.'}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.title}
            className="flex items-start justify-between gap-3 rounded-lg border border-dashed border-white/10 bg-black/10 px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium text-white">{it.title}</div>
              <div className="text-xs text-white/60 mt-0.5">{it.desc}</div>
            </div>
            <code className="shrink-0 rounded bg-black/30 px-2 py-0.5 text-[11px] text-white/60">
              {it.scope}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────
// Meta returns numeric fields as strings. We parse + format defensively.

function formatNumber(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}
function formatDecimal(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}
function formatPercent(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
}
function formatCurrency(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  // Intentionally currency-agnostic — user's ad account currency varies.
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}
