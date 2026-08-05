// src/app/(dashboard)/ads/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { StepGoal } from './_components/StepGoal';
import { StepCreative } from './_components/StepCreative';
import { StepAudience } from './_components/StepAudience';
import { StepReview } from './_components/StepReview';
import { AdPreview } from './_components/AdPreview';
import type { AdDraft, AdTargeting, AdObjective } from '@/lib/meta/ads-types';
import { listTemplates, saveTemplate, deleteTemplate, type AdTemplate } from '@/lib/ads/ad-templates';

interface BrandLite { id: string; name: string; slug: string }
interface MetaAsset { id: string; name?: string; currency?: string }

const STEPS = ['Goal', 'Creative', 'Audience', 'Review'] as const;

export default function AdsPage() {
  const [step, setStep] = useState(0);
  const [brands, setBrands] = useState<BrandLite[]>([]);
  const [adAccounts, setAdAccounts] = useState<MetaAsset[]>([]);
  const [pages, setPages] = useState<MetaAsset[]>([]);
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null);

  const [brandId, setBrandId] = useState('');
  const [objective, setObjective] = useState<AdObjective>('TRAFFIC');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [imageCandidates, setImageCandidates] = useState<string[]>([]);
  const [imageMissing, setImageMissing] = useState(false);
  // Copy problems the generator is meant to avoid but can still produce, e.g.
  // organic 'link in bio' phrasing in a paid ad. Reported, never auto-rewritten.
  const [copyIssues, setCopyIssues] = useState<Array<{ code: string; severity: string; detail: string }>>([]);
  const [targeting, setTargeting] = useState<AdTargeting>({
    countries: ['GB'], cities: [], ageMin: 18, ageMax: 65, gender: 'all', interests: [],
    dailyBudgetMinor: 1000, startDate: '', endDate: '',
  });

  // Repeatable-ad templates (browser-local only). Loading a template only
  // PREFILLS the wizard and jumps to Review — it never auto-publishes.
  const [templates, setTemplates] = useState<AdTemplate[]>([]);
  // Templates live in localStorage, which does not exist while this renders on
  // the server, so the first paint must be the empty list and the real one has
  // to arrive after mount. Deferring by a microtask rather than setting state
  // straight from the effect body avoids forcing a re-render mid-commit; a
  // lazy useState initialiser is not an option here because the server and the
  // client would then disagree about the initial markup.
  useEffect(() => {
    void Promise.resolve().then(() => setTemplates(listTemplates()));
  }, []);

  function handleSaveTemplate(name: string) {
    if (!draft) return;
    saveTemplate(name, {
      brandId,
      objective,
      destinationUrl,
      applicationId: draft.applicationId,
      draft,
      targeting,
    });
    setTemplates(listTemplates());
  }

  function handleLoadTemplate(t: AdTemplate) {
    setBrandId(t.config.brandId);
    setObjective(t.config.objective);
    setDestinationUrl(t.config.destinationUrl);
    setDraft(t.config.draft);
    setTargeting(t.config.targeting);
    // Templates carry a finished draft; no image candidates to surface.
    setImageCandidates([]);
    setImageMissing(false);
    setCopyIssues([]);
    setStep(3); // jump straight to Review
  }

  function handleDeleteTemplate(id: string) {
    deleteTemplate(id);
    setTemplates(listTemplates());
  }

  useEffect(() => {
    fetch('/api/brands').then((r) => r.json()).then((d) => {
      // /api/brands returns { brands: [...] }
      const list = (d.brands ?? d.data ?? d ?? []) as BrandLite[];
      setBrands(list);
      if (list[0]) setBrandId(list[0].id);
    }).catch(() => setBrands([]));

    fetch('/api/meta/account').then((r) => r.json()).then((d) => {
      const acct = d.data;
      setMetaConnected(Boolean(acct));
      const assets = (acct?.assets ?? {}) as { adAccounts?: MetaAsset[]; pages?: MetaAsset[] };
      setAdAccounts(assets.adAccounts ?? []);
      setPages(assets.pages ?? []);
    }).catch(() => setMetaConnected(false));
  }, []);

  if (metaConnected === null) {
    return <div className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-(--muted)">Loading…</div>;
  }

  if (metaConnected === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-(--txt)">Connect your Meta ad account</h1>
        <p className="mt-2 text-sm text-(--muted)">
          The ad builder needs your Facebook/Meta ad-account connection — the one that
          carries your ad accounts and Pages. This is separate from the Instagram
          connection used for analytics, so it&apos;s a one-time extra step here.
        </p>
        <a
          href="/api/meta/oauth/start"
          className="mt-4 inline-block rounded-2xl bg-(--violet) px-4 py-2 text-sm font-medium text-white"
        >
          Connect Meta ad account
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i <= step ? 'bg-(--violet) text-white' : 'bg-(--surface-2) text-(--muted)'}`}>{i + 1}</span>
              <span className={`text-sm ${i === step ? 'text-(--txt)' : 'text-(--muted-2)'}`}>{s}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-(--line-strong)" />}
            </div>
          ))}
        </div>
        <a
          href="/ads/queue"
          className="shrink-0 text-sm font-medium text-(--violet-bright) transition-colors hover:text-(--violet-bright)"
        >
          Queued ads →
        </a>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div>
          {step === 0 && (
            <div className="space-y-5">
              {templates.length > 0 && (
                <TemplatePicker
                  templates={templates}
                  onLoad={handleLoadTemplate}
                  onDelete={handleDeleteTemplate}
                />
              )}
              <StepGoal
                brands={brands} brandId={brandId} setBrandId={setBrandId}
                objective={objective} setObjective={setObjective}
                destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
                onDraft={(d, cands, missing, issues) => { setDraft(d); setImageCandidates(cands); setImageMissing(missing); setCopyIssues(issues ?? []); setStep(1); }}
              />
            </div>
          )}
          {step === 1 && draft && (
            <StepCreative draft={draft} setDraft={setDraft} brandId={brandId} onBack={() => setStep(0)} onNext={() => setStep(2)} candidates={imageCandidates} imageMissing={imageMissing} copyIssues={copyIssues} />
          )}
          {step === 2 && (
            <StepAudience
              targeting={targeting} setTargeting={setTargeting}
              suggestions={draft?.interestSuggestions ?? []}
              currency={adAccounts[0]?.currency ?? ''}
              onBack={() => setStep(1)} onNext={() => setStep(3)}
            />
          )}
          {step === 3 && draft && (
            <div className="space-y-4">
              <SaveTemplateBar onSave={handleSaveTemplate} />
              <StepReview
                draft={draft} targeting={targeting} brandId={brandId}
                adAccounts={adAccounts} pages={pages} onBack={() => setStep(2)}
              />
            </div>
          )}
        </div>
        <AdPreview draft={draft} />
      </div>
    </div>
  );
}

// "Start from a saved template" — shown on the Goal step when templates exist.
// Selecting one restores the full wizard state and jumps to Review.
function TemplatePicker(props: {
  templates: AdTemplate[];
  onLoad: (t: AdTemplate) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-(--violet-24) bg-(--violet-08) p-4">
      <div className="mb-2 text-sm font-semibold text-(--violet-bright)">Start from a saved template</div>
      <ul className="space-y-1.5">
        {props.templates.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => props.onLoad(t)}
              className="flex-1 rounded-xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-left text-sm text-(--txt) transition-colors hover:border-(--violet-24)"
            >
              <span className="font-medium">{t.name}</span>
              <span className="ml-2 text-xs text-(--muted-2)">
                {new Date(t.savedAt).toLocaleDateString()}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete template ${t.name}`}
              title="Delete template"
              onClick={() => props.onDelete(t.id)}
              className="rounded-xl border border-(--line-strong) px-2.5 py-2 text-sm text-(--muted) transition-colors hover:text-red-400"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// "Save as template" — shown on the Review step once a draft exists. Captures
// the current config so the same ad can be recreated later (still PAUSED).
function SaveTemplateBar(props: { onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  function save() {
    const finalName = name.trim() || 'Untitled ad';
    props.onSave(finalName);
    setName('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="rounded-2xl border border-(--line) bg-(--surface) p-3">
      <label className="mb-1.5 block text-sm font-medium text-(--muted)">Save as template</label>
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder="e.g. Spring sale — UK traffic"
          className="flex-1 rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt)"
        />
        <button
          type="button"
          onClick={save}
          className="shrink-0 rounded-2xl border border-(--violet-24) bg-(--violet-08) px-4 py-2 text-sm font-medium text-(--violet-bright) transition-colors hover:bg-(--violet)/20"
        >
          Save
        </button>
      </div>
      {saved && <p className="mt-1.5 text-xs text-(--violet-bright)">Saved — reusable from the Goal step.</p>}
    </div>
  );
}
