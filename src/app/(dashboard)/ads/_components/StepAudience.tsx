// src/app/(dashboard)/ads/_components/StepAudience.tsx
'use client';

import { useEffect } from 'react';
import type { AdTargeting } from '@/lib/meta/ads-types';

// Main ad markets, ISO-2 code + display name. Sorted by name in the picker.
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'AU', name: 'Australia' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PL', name: 'Poland' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'PH', name: 'Philippines' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'HK', name: 'Hong Kong' },
];

const COUNTRIES_SORTED = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function StepAudience(props: {
  targeting: AdTargeting; setTargeting: (t: AdTargeting) => void;
  suggestions: string[];
  currency?: string;
  onBack: () => void; onNext: () => void;
}) {
  const { targeting, setTargeting } = props;
  const currency = props.currency?.trim() ?? '';
  const set = <K extends keyof AdTargeting>(k: K, v: AdTargeting[K]) => setTargeting({ ...targeting, [k]: v });

  // Seed sensible default dates (tomorrow → +7 days) once.
  useEffect(() => {
    if (!targeting.startDate) {
      const start = new Date(Date.now() + 86_400_000);
      const end = new Date(Date.now() + 8 * 86_400_000);
      setTargeting({ ...targeting, startDate: start.toISOString(), endDate: end.toISOString() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill interest chips from AI suggestions once.
  useEffect(() => {
    if (targeting.interests.length === 0 && props.suggestions.length) {
      set('interests', props.suggestions.slice(0, 5));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.suggestions]);

  function toggleInterest(name: string) {
    set('interests', targeting.interests.includes(name)
      ? targeting.interests.filter((i) => i !== name)
      : [...targeting.interests, name]);
  }

  function addCountry(code: string) {
    if (!code || targeting.countries.includes(code)) return;
    set('countries', [...targeting.countries, code]);
  }

  function removeCountry(code: string) {
    set('countries', targeting.countries.filter((c) => c !== code));
  }

  const budgetLabel = currency ? `Daily budget (${currency})` : 'Daily budget';
  const budgetHint = `Most ad accounts require at least ~5–10${currency ? ` ${currency}` : ''} / day.`;

  return (
    <div className="space-y-5">
      <Labeled label="Countries">
        <div className="space-y-2">
          <select
            value=""
            onChange={(e) => { addCountry(e.target.value); e.currentTarget.value = ''; }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Add a country…</option>
            {COUNTRIES_SORTED.map((c) => (
              <option key={c.code} value={c.code} disabled={targeting.countries.includes(c.code)}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {targeting.countries.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => removeCountry(code)}
                className="flex items-center gap-1 rounded-full border border-teal-500 bg-teal-500/10 px-3 py-1 text-xs text-teal-300"
              >
                {COUNTRY_NAME.get(code) ?? code} ({code})
                <span className="text-teal-400/70">×</span>
              </button>
            ))}
          </div>
        </div>
      </Labeled>

      <div className="grid grid-cols-3 gap-3">
        <Labeled label="Gender">
          <select value={targeting.gender} onChange={(e) => set('gender', e.target.value as AdTargeting['gender'])}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
            <option value="all">All</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </Labeled>
        <Labeled label="Age min">
          <input type="number" min={13} max={65} value={targeting.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        </Labeled>
        <Labeled label="Age max">
          <input type="number" min={13} max={65} value={targeting.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
        </Labeled>
      </div>

      <Labeled label="Interests (AI-suggested — click to toggle)">
        <div className="flex flex-wrap gap-2">
          {[...new Set([...props.suggestions, ...targeting.interests])].map((name) => {
            const active = targeting.interests.includes(name);
            return (
              <button key={name} type="button" onClick={() => toggleInterest(name)}
                className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-teal-500 bg-teal-500/10 text-teal-300' : 'border-zinc-700 text-zinc-400'}`}>
                {name}
              </button>
            );
          })}
        </div>
      </Labeled>

      <div className="grid grid-cols-2 gap-3">
        <Labeled label={budgetLabel}>
          <input type="number" min={0} step="0.01" value={(targeting.dailyBudgetMinor / 100).toString()}
            onChange={(e) => { const n = Number(e.target.value); set('dailyBudgetMinor', Number.isNaN(n) ? 0 : Math.round(n * 100)); }}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" />
          <p className="mt-1 text-xs text-zinc-500">{budgetHint}</p>
        </Labeled>
        <Labeled label="Run dates">
          <div className="flex gap-2">
            <input type="date" value={targeting.startDate.slice(0, 10)}
              onChange={(e) => { if (e.target.value) set('startDate', new Date(e.target.value).toISOString()); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-100" />
            <input type="date" value={targeting.endDate.slice(0, 10)}
              onChange={(e) => { if (e.target.value) set('endDate', new Date(e.target.value).toISOString()); }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-100" />
          </div>
        </Labeled>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Back</button>
        <button type="button" onClick={props.onNext} disabled={targeting.countries.length === 0}
          className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

function Labeled(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-300">{props.label}</label>
      {props.children}
    </div>
  );
}
