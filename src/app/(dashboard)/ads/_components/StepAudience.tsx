// src/app/(dashboard)/ads/_components/StepAudience.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdTargeting } from '@/lib/meta/ads-types';
import { findOverlap, type GeoCity } from '@/lib/ads/geo-overlap';
import { runDays, endDateForDays, describeRun } from '@/lib/ads/budget-plan';

// A single Meta adgeolocation result row returned by /api/meta/geo-search.
interface GeoResult { key: string; name: string; type: string; countryName?: string; region?: string; lat?: number; lng?: number }

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
  const [customInterest, setCustomInterest] = useState('');

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

  function addCustomInterest() {
    const name = customInterest.trim();
    if (!name) return;
    if (!targeting.interests.includes(name)) set('interests', [...targeting.interests, name]);
    setCustomInterest('');
  }

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

  // ── City search (typeahead) ───────────────────────────────────────────────
  const cities = targeting.cities ?? [];
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<GeoResult[]>([]);
  const [citySearching, setCitySearching] = useState(false);
  const [cityWarning, setCityWarning] = useState<string | null>(null);
  const cityReqId = useRef(0); // guards against out-of-order responses

  useEffect(() => {
    const q = cityQuery.trim();
    if (q.length < 2) { setCityResults([]); setCitySearching(false); return; }
    setCitySearching(true);
    const reqId = ++cityReqId.current;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/meta/geo-search?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { locations?: GeoResult[] };
        if (reqId === cityReqId.current) setCityResults(json.locations ?? []);
      } catch {
        if (reqId === cityReqId.current) setCityResults([]);
      } finally {
        if (reqId === cityReqId.current) setCitySearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [cityQuery]);

  function addCity(r: GeoResult) {
    if (cities.some((c) => c.key === r.key)) return;
    // Overlap guard: Meta rejects overlapping city radii (subcode 1487756).
    if (r.lat != null && r.lng != null) {
      const existing: GeoCity[] = cities
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({ key: c.key, name: c.name, lat: c.lat as number, lng: c.lng as number, radius: c.radius, distanceUnit: c.distanceUnit }));
      const clash = findOverlap(existing, { key: r.key, name: r.name, lat: r.lat, lng: r.lng });
      if (clash) {
        setCityWarning(`${r.name} overlaps ${clash.name}. Remove one — Meta rejects overlapping locations.`);
        return;
      }
    }
    setCityWarning(null);
    set('cities', [...cities, { key: r.key, name: r.name, lat: r.lat, lng: r.lng }]);
    setCityQuery('');
    setCityResults([]);
    cityReqId.current++; // discard any in-flight response for the cleared query
  }

  function removeCity(key: string) {
    set('cities', cities.filter((c) => c.key !== key));
  }

  const days = runDays(targeting.startDate, targeting.endDate);
  const budgetLabel = currency ? `Spend per day (${currency})` : 'Spend per day';
  const budgetHint = `Most ad accounts need at least ${currency ? `${currency} ` : ''}5 a day.`;

  return (
    <div className="space-y-5">
      <Labeled label="Countries">
        <div className="space-y-2">
          <select
            value=""
            onChange={(e) => { addCountry(e.target.value); e.currentTarget.value = ''; }}
            className="w-full rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt)"
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
                className="flex items-center gap-1 rounded-full border border-(--violet-24) bg-(--violet-08) px-3 py-1 text-xs text-(--violet-bright)"
              >
                {COUNTRY_NAME.get(code) ?? code} ({code})
                <span className="text-(--violet-bright)/70">×</span>
              </button>
            ))}
          </div>
        </div>
      </Labeled>

      <Labeled label="Cities (optional)">
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Search a city, e.g. Melbourne…"
              className="w-full rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt) placeholder:text-(--muted-2)"
            />
            {(citySearching || cityResults.length > 0) && cityQuery.trim().length >= 2 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-(--line-strong) bg-(--surface) py-1 text-sm shadow-lg">
                {citySearching && cityResults.length === 0 && (
                  <li className="px-3 py-2 text-xs text-(--muted-2)">Searching…</li>
                )}
                {cityResults.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => addCity(r)}
                      disabled={cities.some((c) => c.key === r.key)}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-(--violet-08) disabled:opacity-50"
                    >
                      <span className="text-(--txt)">{r.name}</span>
                      {(r.region || r.countryName) && (
                        <span className="text-xs text-(--muted-2)">
                          {[r.region, r.countryName].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {cityWarning && <p className="text-xs text-red-400">{cityWarning}</p>}
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => removeCity(c.key)}
                className="flex items-center gap-1 rounded-full border border-(--violet-24) bg-(--violet-08) px-3 py-1 text-xs text-(--violet-bright)"
              >
                {c.name}
                <span className="text-(--violet-bright)/70">×</span>
              </button>
            ))}
          </div>
        </div>
      </Labeled>

      <div className="grid grid-cols-3 gap-3">
        <Labeled label="Gender">
          <select value={targeting.gender} onChange={(e) => set('gender', e.target.value as AdTargeting['gender'])}
            className="w-full rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt)">
            <option value="all">All</option><option value="male">Male</option><option value="female">Female</option>
          </select>
        </Labeled>
        <Labeled label="Age min">
          <input type="number" min={13} max={65} value={targeting.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))}
            className="w-full rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt)" />
        </Labeled>
        <Labeled label="Age max">
          <input type="number" min={13} max={65} value={targeting.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))}
            className="w-full rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt)" />
        </Labeled>
      </div>

      <Labeled label="Who should Meta show this to?">
        <div className="space-y-2">
          {([
            {
              value: 'detailed' as const,
              title: 'Pick the audience myself',
              blurb: 'Deliver to the age, location, gender and interests set above, and no further.',
            },
            {
              value: 'broad' as const,
              title: 'Let the creative find the audience',
              blurb: 'Turns on Meta Advantage+ audience. The settings above become suggestions and delivery can go beyond them. Meta looks for people who respond, rather than people who match.',
            },
          ]).map((opt) => {
            const active = (targeting.audienceMode ?? 'detailed') === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => set('audienceMode', opt.value)}
                className={`w-full rounded-2xl border px-3 py-2.5 text-left ${active ? 'border-(--violet-24) bg-(--violet-08)' : 'border-(--line-strong)'}`}>
                <div className={`text-sm font-medium ${active ? 'text-(--violet-bright)' : 'text-(--txt)'}`}>{opt.title}</div>
                <div className="mt-0.5 text-xs text-(--muted)">{opt.blurb}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-(--muted)">
          Neither is proven for these brands yet. Running one of each is the only way to find out which works.
        </p>
      </Labeled>

      <Labeled label="Interests (AI-suggested — click to toggle, or add your own)">
        <div className="flex flex-wrap gap-2">
          {[...new Set([...props.suggestions, ...targeting.interests])].map((name) => {
            const active = targeting.interests.includes(name);
            return (
              <button key={name} type="button" onClick={() => toggleInterest(name)}
                className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-(--violet-24) bg-(--violet-08) text-(--violet-bright)' : 'border-(--line-strong) text-(--muted)'}`}>
                {name}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={customInterest}
            onChange={(e) => setCustomInterest(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomInterest(); } }}
            placeholder="Add an interest, e.g. Reggaeton, J Balvin, Running"
            className="flex-1 rounded-2xl border border-(--line-strong) bg-(--surface) px-3 py-2 text-sm text-(--txt) placeholder:text-(--muted-2)"
          />
          <button type="button" onClick={addCustomInterest}
            className="rounded-2xl border border-(--line-strong) px-4 py-2 text-sm font-medium text-(--txt) hover:bg-white/[0.04]">
            Add
          </button>
        </div>
        <p className="mt-1 text-xs text-(--muted-2)">Custom interests are matched to Meta&apos;s interest list on publish; unmatched ones are skipped.</p>
      </Labeled>

      {/* Budget and duration. The old version showed a per-day figure and two
          date pickers, leaving the reader to work out both the length of the
          run and what it would actually cost. Days are the unit people think
          in, so they are entered directly and the end date is derived. */}
      <div className="rounded-2xl border border-(--line-strong) bg-(--surface) p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label={budgetLabel}>
            <input type="number" min={0} step="0.01" value={(targeting.dailyBudgetMinor / 100).toString()}
              onChange={(e) => { const n = Number(e.target.value); set('dailyBudgetMinor', Number.isNaN(n) ? 0 : Math.round(n * 100)); }}
              className="w-full rounded-2xl border border-(--line-strong) bg-(--bg) px-3 py-2 text-sm text-(--txt)" />
            <p className="mt-1 text-xs text-(--muted)">{budgetHint}</p>
          </Labeled>

          <Labeled label="Run it for">
            <div className="flex flex-wrap gap-1.5">
              {[3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('endDate', endDateForDays(targeting.startDate, d))}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    days === d
                      ? 'border-(--violet-24) bg-(--violet-08) text-(--violet-bright)'
                      : 'border-(--line-strong) text-(--muted) hover:text-(--txt)'
                  }`}
                >
                  {d} days
                </button>
              ))}
              <input
                type="number"
                min={1}
                aria-label="Number of days to run"
                value={days || ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 1) set('endDate', endDateForDays(targeting.startDate, n));
                }}
                className="w-20 rounded-full border border-(--line-strong) bg-(--bg) px-3 py-1 text-xs text-(--txt)"
              />
            </div>
          </Labeled>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Labeled label="Starting">
            <input type="date" value={targeting.startDate.slice(0, 10)}
              onChange={(e) => {
                if (!e.target.value) return;
                const nextStart = new Date(e.target.value).toISOString();
                // Hold the run LENGTH steady when the start moves, rather than
                // silently shortening or extending it.
                setTargeting({ ...targeting, startDate: nextStart, endDate: endDateForDays(nextStart, days || 1) });
              }}
              className="w-full rounded-2xl border border-(--line-strong) bg-(--bg) px-3 py-2 text-sm text-(--txt)" />
          </Labeled>
          <Labeled label="Ending">
            <input type="date" value={targeting.endDate.slice(0, 10)}
              onChange={(e) => { if (e.target.value) set('endDate', new Date(e.target.value).toISOString()); }}
              className="w-full rounded-2xl border border-(--line-strong) bg-(--bg) px-3 py-2 text-sm text-(--txt)" />
          </Labeled>
        </div>

        <p className="mt-4 border-t border-(--line) pt-3 text-sm font-medium text-(--txt)">
          {describeRun({
            startDate: targeting.startDate,
            endDate: targeting.endDate,
            dailyBudgetMinor: targeting.dailyBudgetMinor,
            currency: currency || 'GBP',
          })}
        </p>
        <p className="mt-1 text-xs text-(--muted)">
          Meta will not spend more than the daily amount, and stops on the end date.
        </p>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={props.onBack} className="rounded-2xl border border-(--line-strong) px-4 py-2 text-sm text-(--muted)">Back</button>
        <button type="button" onClick={props.onNext} disabled={targeting.countries.length === 0 && (targeting.cities?.length ?? 0) === 0}
          className="rounded-2xl bg-(--violet) px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

function Labeled(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-(--muted)">{props.label}</label>
      {props.children}
    </div>
  );
}
