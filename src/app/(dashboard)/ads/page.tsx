// src/app/(dashboard)/ads/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { StepGoal } from './_components/StepGoal';
import { StepCreative } from './_components/StepCreative';
import { StepAudience } from './_components/StepAudience';
import { StepReview } from './_components/StepReview';
import { AdPreview } from './_components/AdPreview';
import type { AdDraft, AdTargeting, AdObjective } from '@/lib/meta/ads-types';

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
  const [targeting, setTargeting] = useState<AdTargeting>({
    countries: ['GB'], ageMin: 18, ageMax: 65, gender: 'all', interests: [],
    dailyBudgetMinor: 1000, startDate: '', endDate: '',
  });

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
          className="shrink-0 text-sm font-medium text-(--violet-bright) transition-colors hover:text-(--violet)"
        >
          Queued ads →
        </a>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div>
          {step === 0 && (
            <StepGoal
              brands={brands} brandId={brandId} setBrandId={setBrandId}
              objective={objective} setObjective={setObjective}
              destinationUrl={destinationUrl} setDestinationUrl={setDestinationUrl}
              onDraft={(d, cands, missing) => { setDraft(d); setImageCandidates(cands); setImageMissing(missing); setStep(1); }}
            />
          )}
          {step === 1 && draft && (
            <StepCreative draft={draft} setDraft={setDraft} brandId={brandId} onBack={() => setStep(0)} onNext={() => setStep(2)} candidates={imageCandidates} imageMissing={imageMissing} />
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
            <StepReview
              draft={draft} targeting={targeting} brandId={brandId}
              adAccounts={adAccounts} pages={pages} onBack={() => setStep(2)}
            />
          )}
        </div>
        <AdPreview draft={draft} />
      </div>
    </div>
  );
}
