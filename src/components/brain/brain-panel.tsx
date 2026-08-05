'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Sparkles, Circle } from 'lucide-react';
import { parseBrief, type BriefSection, type BriefTone } from '@/lib/brain/brief-format';

interface Props { brandId: string; }

interface BrainResponse {
  brain: { briefVersion: number; generatedAt: string; briefMd: string; lastRunStatus: string; ingestedSources: Record<string, string> } | null;
  recent: { source: string; capturedAt: string }[];
}

// Plain names for the ingest sources. "competitor_account" is a column name.
const SOURCE_LABELS: Record<string, string> = {
  ig: 'your Instagram',
  ads: 'your ads',
  competitor_account: 'your competitors',
};

const TONE_STYLES: Record<BriefTone, { wrap: string; icon: string; Icon: typeof CheckCircle2 }> = {
  action: {
    wrap: 'border-(--violet-24) bg-gradient-to-br from-(--violet-12) to-(--surface)',
    icon: 'text-(--violet-bright)',
    Icon: Sparkles,
  },
  good: { wrap: 'border-(--line) bg-(--surface)', icon: 'text-(--success)', Icon: CheckCircle2 },
  bad: { wrap: 'border-(--line) bg-(--surface)', icon: 'text-amber-300', Icon: AlertTriangle },
  neutral: { wrap: 'border-(--line) bg-(--surface)', icon: 'text-(--muted)', Icon: Circle },
};

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SectionCard({ section }: { section: BriefSection }) {
  const { wrap, icon, Icon } = TONE_STYLES[section.tone];
  return (
    <div className={`rounded-2xl border p-4 ${wrap}`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-(--txt)">
        <Icon className={`h-4 w-4 shrink-0 ${icon}`} />
        {section.title}
      </h3>
      <ul className="space-y-2.5">
        {section.items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed">
            {item.label && <span className="font-medium text-(--txt)">{item.label}. </span>}
            <span className="text-(--muted)">{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BrainPanel({ brandId }: Props) {
  const [data, setData] = useState<BrainResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoadFailed(false);
    try {
      const r = await fetch(`/api/brain?brandId=${brandId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch {
      setLoadFailed(true);
    }
  }

  useEffect(() => { load(); }, [brandId]);

  async function runNow() {
    setRunning(true); setError(null);
    try {
      const r = await fetch(`/api/brain/trigger?brandId=${brandId}`, { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch {
      setError('Could not run the analysis just now. Try again in a moment.');
    } finally {
      setRunning(false);
    }
  }

  const runButton = (
    <button
      onClick={runNow}
      disabled={running}
      className="shrink-0 rounded-lg border border-(--line-strong) px-3 py-1.5 text-sm text-(--txt) transition-colors hover:border-(--violet) disabled:opacity-50"
    >
      {running ? 'Working…' : 'Run now'}
    </button>
  );

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-(--line) bg-(--surface) p-6 text-sm text-rose-400">
        Could not load what we have learned about this brand. Refresh the page to
        try again.
      </div>
    );
  }

  if (!data) {
    return <div className="text-sm text-(--muted)">Loading what we have learned…</div>;
  }

  if (!data.brain) {
    return (
      <div className="rounded-2xl border border-(--line) bg-(--surface) p-6">
        <div className="mb-2 font-medium text-(--txt)">What we have learned</div>
        <p className="mb-3 text-sm text-(--muted)">
          Nothing yet for this brand. Run it once and it will read your recent
          posts and your competitors, then tell you what to do next.
        </p>
        {runButton}
        {error && <div className="mt-2 text-sm text-rose-400">{error}</div>}
      </div>
    );
  }

  const sections = parseBrief(data.brain.briefMd);
  const sources = data.brain.ingestedSources ?? {};
  const used = Object.entries(sources)
    .filter(([, status]) => status === 'ok')
    .map(([key]) => SOURCE_LABELS[key] ?? key);
  const updated = formatDay(data.brain.generatedAt);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-(--txt)">What we have learned</h2>
          <p className="mt-0.5 text-xs text-(--muted)">
            {used.length > 0 ? `Based on ${used.join(' and ')}.` : 'No sources connected yet.'}
            {updated && ` Last updated ${updated}.`}
          </p>
        </div>
        {runButton}
      </div>

      {error && <div className="text-sm text-rose-400">{error}</div>}

      {sections.length === 0 ? (
        <div className="rounded-2xl border border-(--line) bg-(--surface) p-4 text-sm text-(--muted)">
          The last run did not find enough to report on. That usually means too
          few recent posts to spot a pattern. Keep posting and check back.
        </div>
      ) : (
        sections.map((s) => <SectionCard key={s.id} section={s} />)
      )}
    </div>
  );
}
