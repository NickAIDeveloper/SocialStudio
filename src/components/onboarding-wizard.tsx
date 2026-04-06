'use client';

import { useState, useEffect, useCallback } from 'react';
import HealthScore from '@/components/health-score';

// ── Types ────────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  onComplete: () => void;
}

interface BrandData {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  instagramHandle: string;
  logoUrl: string;
  description: string;
}

interface CompetitorSuggestion {
  handle: string;
  reason: string;
}

interface AnalyticsResult {
  healthScore?: number;
  summary?: string;
}

type StepNumber = 1 | 2 | 3 | 4 | 5;

const TOTAL_STEPS = 5;

// ── Helpers ──────────────────────────────────────────────────────────────────

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isCurrent = step === current;
        const isCompleted = step < current;
        return (
          <div
            key={step}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              isCurrent
                ? 'w-8 bg-teal-500'
                : isCompleted
                  ? 'w-2.5 bg-teal-500/60'
                  : 'w-2.5 bg-zinc-700'
            }`}
          />
        );
      })}
    </div>
  );
}

// ── Step 1: Brand ────────────────────────────────────────────────────────────

function StepBrand({
  brand,
  onChange,
  onNext,
}: {
  brand: BrandData;
  onChange: (updates: Partial<BrandData>) => void;
  onNext: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (name: string) => {
    onChange({ name, slug: nameToSlug(name) });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch('/api/brands/logo', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Upload failed');
        return;
      }

      onChange({ logoUrl: json.url });
    } catch {
      setError('Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleNext = async () => {
    if (!brand.name.trim()) {
      setError('Brand name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: brand.name,
          slug: brand.slug || nameToSlug(brand.name),
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          instagramHandle: brand.instagramHandle || null,
          logoUrl: brand.logoUrl || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to create brand');
        return;
      }

      onChange({ id: json.brand.id });
      onNext();
    } catch {
      setError('Failed to create brand');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">What&apos;s your brand?</h2>
        <p className="text-sm text-zinc-400 mt-1">Tell us about your brand identity</p>
      </div>

      {/* Brand Name */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">
          Brand Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={brand.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="My Brand"
          className="w-full rounded-lg border border-white/5 bg-zinc-800/60 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
        />
      </div>

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Logo</label>
        <div className="flex items-center gap-3">
          {brand.logoUrl && (
            <img
              src={brand.logoUrl}
              alt="Logo preview"
              className="h-10 w-10 rounded-lg object-contain bg-zinc-800/60 border border-white/5 p-0.5"
            />
          )}
          <label className="flex-1 cursor-pointer">
            <div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-zinc-800/40 px-4 py-2.5 text-sm text-zinc-400 transition hover:border-teal-500/30 hover:text-zinc-300">
              {uploading ? 'Uploading...' : brand.logoUrl ? 'Change logo' : 'Upload logo'}
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">Primary Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brand.primaryColor}
              onChange={(e) => onChange({ primaryColor: e.target.value })}
              className="h-10 w-10 cursor-pointer rounded-lg border border-white/5 bg-transparent"
            />
            <input
              type="text"
              value={brand.primaryColor}
              onChange={(e) => onChange({ primaryColor: e.target.value })}
              className="flex-1 rounded-lg border border-white/5 bg-zinc-800/60 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">Secondary Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brand.secondaryColor}
              onChange={(e) => onChange({ secondaryColor: e.target.value })}
              className="h-10 w-10 cursor-pointer rounded-lg border border-white/5 bg-transparent"
            />
            <input
              type="text"
              value={brand.secondaryColor}
              onChange={(e) => onChange({ secondaryColor: e.target.value })}
              className="flex-1 rounded-lg border border-white/5 bg-zinc-800/60 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            />
          </div>
        </div>
      </div>

      {/* Instagram Handle */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">Instagram Handle</label>
        <div className="flex items-center">
          <span className="flex h-[42px] items-center rounded-l-lg border border-r-0 border-white/5 bg-zinc-800/80 px-3 text-sm text-zinc-500">
            @
          </span>
          <input
            type="text"
            value={brand.instagramHandle}
            onChange={(e) => onChange({ instagramHandle: e.target.value })}
            placeholder="yourbrand"
            className="flex-1 rounded-r-lg border border-white/5 bg-zinc-800/60 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">
          Brand Description
        </label>
        <textarea
          value={brand.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="A brief description of what your brand does (used for competitor suggestions)"
          rows={2}
          className="w-full rounded-lg border border-white/5 bg-zinc-800/60 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-none"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={handleNext}
        disabled={saving || uploading}
        className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Creating brand...' : 'Next'}
      </button>
    </div>
  );
}

// ── Step 2: Connect Tools ────────────────────────────────────────────────────

interface ToolConnection {
  provider: string;
  label: string;
  placeholder: string;
  connected: boolean;
}

function StepTools({
  onNext,
  onBack,
  onSkip,
}: {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [tools, setTools] = useState<ToolConnection[]>([
    { provider: 'buffer', label: 'Buffer', placeholder: 'Paste your Buffer personal access token', connected: false },
    { provider: 'pixabay', label: 'Pixabay', placeholder: 'Paste your Pixabay API key', connected: false },
    { provider: 'unsplash', label: 'Unsplash', placeholder: 'Paste your Unsplash access key', connected: false },
    { provider: 'pexels', label: 'Pexels', placeholder: 'Paste your Pexels API key', connected: false },
    { provider: 'openai_images', label: 'OpenAI Images', placeholder: 'Paste your OpenAI API key', connected: false },
  ]);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check already-connected accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch('/api/linked-accounts');
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const connectedProviders = new Set(
            json.data.map((a: { provider: string }) => a.provider),
          );
          setTools((prev) =>
            prev.map((t) => ({
              ...t,
              connected: connectedProviders.has(t.provider),
            })),
          );
        }
      } catch {
        // Non-critical, continue
      }
    }
    fetchAccounts();
  }, []);

  const handleConnect = async (provider: string) => {
    const token = tokens[provider]?.trim();
    if (!token) {
      setError('Please enter an API key');
      return;
    }

    setLoadingProvider(provider);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/linked-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, accessToken: token }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Connection failed');
        return;
      }

      setTools((prev) =>
        prev.map((t) =>
          t.provider === provider ? { ...t, connected: true } : t,
        ),
      );
      setTokens((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      setSuccessMsg(`${tools.find((t) => t.provider === provider)?.label} connected`);
    } catch {
      setError('Connection failed');
    } finally {
      setLoadingProvider(null);
    }
  };

  const hasBuffer = tools.some((t) => t.provider === 'buffer' && t.connected);
  const hasImageSource = tools.some(
    (t) =>
      ['pixabay', 'unsplash', 'pexels', 'openai_images'].includes(t.provider) &&
      t.connected,
  );
  const canProceed = hasBuffer && hasImageSource;

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">Connect your tools</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Link Buffer + at least one image source to get started
        </p>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {tools.map((tool) => (
          <div
            key={tool.provider}
            className="rounded-xl border border-white/5 bg-zinc-900/60 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{tool.label}</span>
              {tool.connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                  Connected
                </span>
              ) : (
                <span className="text-xs text-zinc-500">
                  {tool.provider === 'buffer' ? 'Required' : 'Optional'}
                </span>
              )}
            </div>

            {!tool.connected && (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokens[tool.provider] || ''}
                  onChange={(e) =>
                    setTokens((prev) => ({ ...prev, [tool.provider]: e.target.value }))
                  }
                  placeholder={tool.placeholder}
                  disabled={loadingProvider !== null}
                  className="flex-1 rounded-lg border border-white/5 bg-zinc-800/60 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50 disabled:opacity-50"
                />
                <button
                  onClick={() => handleConnect(tool.provider)}
                  disabled={loadingProvider !== null}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingProvider === tool.provider ? 'Validating...' : 'Connect'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {successMsg && <p className="text-sm text-teal-400">{successMsg}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-white/5 bg-zinc-800/60 px-5 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-700/60 hover:text-white"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center text-sm text-zinc-500 hover:text-zinc-400 transition"
      >
        Skip for now
      </button>
    </div>
  );
}

// ── Step 3: Competitors ──────────────────────────────────────────────────────

function StepCompetitors({
  brandDescription,
  onNext,
  onBack,
  onSkip,
  onCompetitorCount,
}: {
  brandDescription: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onCompetitorCount: (count: number) => void;
}) {
  const [suggestions, setSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [manualHandle, setManualHandle] = useState('');
  const [addingManual, setAddingManual] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const res = await fetch('/api/competitors/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandDescription: brandDescription || 'general social media brand',
            niche: 'social media',
          }),
        });

        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.suggestions)) {
            setSuggestions(json.suggestions);
          }
        }
      } catch {
        // Non-critical
      } finally {
        setLoadingSuggestions(false);
      }
    }
    fetchSuggestions();
  }, [brandDescription]);

  const toggleSelection = (handle: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) {
        next.delete(handle);
      } else {
        next.add(handle);
      }
      return next;
    });
  };

  const handleTrackSelected = async () => {
    if (selected.size === 0) {
      setError('Select at least one competitor');
      return;
    }

    setTracking(true);
    setError(null);

    let successCount = 0;

    for (const handle of selected) {
      try {
        const res = await fetch('/api/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle }),
        });

        if (res.ok || res.status === 409) {
          successCount++;
        }
      } catch {
        // Continue with others
      }
    }

    onCompetitorCount(successCount);
    setTracked(true);
    setTracking(false);
  };

  const handleAddManual = async () => {
    const handle = manualHandle.trim().replace(/^@/, '');
    if (!handle) return;

    setAddingManual(true);
    setError(null);

    try {
      const res = await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      });

      if (res.ok) {
        setSuggestions((prev) => [
          ...prev,
          { handle, reason: 'Manually added' },
        ]);
        setSelected((prev) => new Set([...prev, handle]));
        setManualHandle('');
        onCompetitorCount((selected.size) + 1);
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to add competitor');
      }
    } catch {
      setError('Failed to add competitor');
    } finally {
      setAddingManual(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">Who are your competitors?</h2>
        <p className="text-sm text-zinc-400 mt-1">Track competitors to benchmark your performance</p>
      </div>

      {loadingSuggestions ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
          <span className="ml-3 text-sm text-zinc-400">Finding competitors...</span>
        </div>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {suggestions.map((s) => (
                <label
                  key={s.handle}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    selected.has(s.handle)
                      ? 'border-teal-500/30 bg-teal-500/5'
                      : 'border-white/5 bg-zinc-900/40 hover:border-white/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.handle)}
                    onChange={() => toggleSelection(s.handle)}
                    disabled={tracked}
                    className="mt-0.5 rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500/30"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">@{s.handle}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{s.reason}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {!tracked && suggestions.length > 0 && (
            <button
              onClick={handleTrackSelected}
              disabled={tracking || selected.size === 0}
              className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {tracking
                ? 'Tracking...'
                : `Track Selected (${selected.size})`}
            </button>
          )}

          {tracked && (
            <p className="text-sm text-teal-400 text-center">
              {selected.size} competitor{selected.size !== 1 ? 's' : ''} tracked
            </p>
          )}

          {/* Manual Add */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Add more
            </label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center">
                <span className="flex h-[38px] items-center rounded-l-lg border border-r-0 border-white/5 bg-zinc-800/80 px-2 text-sm text-zinc-500">
                  @
                </span>
                <input
                  type="text"
                  value={manualHandle}
                  onChange={(e) => setManualHandle(e.target.value)}
                  placeholder="competitor_handle"
                  className="flex-1 rounded-r-lg border border-white/5 bg-zinc-800/60 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                />
              </div>
              <button
                onClick={handleAddManual}
                disabled={addingManual || !manualHandle.trim()}
                className="rounded-lg bg-zinc-800 border border-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
              >
                {addingManual ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-white/5 bg-zinc-800/60 px-5 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-700/60 hover:text-white"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          Next
        </button>
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center text-sm text-zinc-500 hover:text-zinc-400 transition"
      >
        Skip for now
      </button>
    </div>
  );
}

// ── Step 4: Analyzing ────────────────────────────────────────────────────────

function StepAnalyzing({
  onNext,
  onBack,
  onAnalyticsResult,
}: {
  onNext: () => void;
  onBack: () => void;
  onAnalyticsResult: (result: AnalyticsResult) => void;
}) {
  const [analyzing, setAnalyzing] = useState(true);
  const [result, setResult] = useState<AnalyticsResult | null>(null);

  useEffect(() => {
    let autoAdvanceTimer: ReturnType<typeof setTimeout>;

    async function runAnalysis() {
      try {
        const res = await fetch('/api/insights?type=analytics', {
          method: 'POST',
        });

        if (res.ok) {
          const json = await res.json();
          const analyticsResult: AnalyticsResult = {
            healthScore: json.healthScore ?? 0,
            summary: json.summary ?? 'Your account analysis is ready.',
          };
          setResult(analyticsResult);
          onAnalyticsResult(analyticsResult);
        } else {
          const fallback: AnalyticsResult = {
            healthScore: 0,
            summary: 'Analysis complete. Start posting to build your score.',
          };
          setResult(fallback);
          onAnalyticsResult(fallback);
        }
      } catch {
        const fallback: AnalyticsResult = {
          healthScore: 0,
          summary: 'Analysis complete. Start posting to build your score.',
        };
        setResult(fallback);
        onAnalyticsResult(fallback);
      } finally {
        setAnalyzing(false);
        autoAdvanceTimer = setTimeout(onNext, 3000);
      }
    }

    runAnalysis();

    return () => {
      clearTimeout(autoAdvanceTimer);
    };
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white">
          {analyzing ? 'Analyzing your account...' : 'Analysis complete'}
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          {analyzing
            ? 'Crunching your Instagram data'
            : 'Here is your starting Health Score'}
        </p>
      </div>

      {analyzing ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-3 border-teal-500 border-t-transparent" />
          <p className="text-sm text-zinc-400 animate-pulse">
            Analyzing your Instagram...
          </p>
        </div>
      ) : (
        result && (
          <HealthScore
            score={result.healthScore ?? 0}
            summary={result.summary ?? ''}
          />
        )
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          disabled={analyzing}
          className="rounded-lg border border-white/5 bg-zinc-800/60 px-5 py-2.5 text-sm font-medium text-zinc-400 transition hover:bg-zinc-700/60 hover:text-white disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={analyzing}
          className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analyzing ? 'Analyzing...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Ready ────────────────────────────────────────────────────────────

function StepReady({
  brandName,
  toolsConnected,
  competitorsTracked,
  onComplete,
}: {
  brandName: string;
  toolsConnected: number;
  competitorsTracked: number;
  onComplete: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="mb-6">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-500/10">
          <svg
            className="h-8 w-8 text-teal-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">You&apos;re ready!</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Your workspace is set up and ready to go
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-4 text-left">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Brand</p>
          <p className="text-sm font-medium text-white mt-1">{brandName || 'Not set'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-4 text-left">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Tools</p>
            <p className="text-sm font-medium text-white mt-1">
              {toolsConnected} connected
            </p>
          </div>
          <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-4 text-left">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Competitors</p>
            <p className="text-sm font-medium text-white mt-1">
              {competitorsTracked} tracked
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onComplete}
        className="w-full rounded-lg bg-teal-600 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

// ── Main Wizard ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<StepNumber>(1);
  const [brand, setBrand] = useState<BrandData>({
    id: '',
    name: '',
    slug: '',
    primaryColor: '#14b8a6',
    secondaryColor: '#0d9488',
    instagramHandle: '',
    logoUrl: '',
    description: '',
  });
  const [competitorCount, setCompetitorCount] = useState(0);
  const [toolsConnected, setToolsConnected] = useState(0);
  const [, setAnalyticsResult] = useState<AnalyticsResult | null>(null);

  const updateBrand = useCallback((updates: Partial<BrandData>) => {
    setBrand((prev) => ({ ...prev, ...updates }));
  }, []);

  const goNext = useCallback(() => {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS) as StepNumber);
  }, []);

  const goBack = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 1) as StepNumber);
  }, []);

  // When skipping tools step, count connected tools from API
  const handleToolsSkipOrNext = useCallback(async () => {
    try {
      const res = await fetch('/api/linked-accounts');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setToolsConnected(json.data.length);
        }
      }
    } catch {
      // Non-critical
    }
    goNext();
  }, [goNext]);

  const handleSkipStep = useCallback(() => {
    goNext();
  }, [goNext]);

  const handleComplete = useCallback(async () => {
    try {
      await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingCompleted: true,
          onboardingStep: TOTAL_STEPS,
        }),
      });
    } catch {
      // Non-critical, still dismiss wizard
    }
    onComplete();
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-zinc-950/95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <ProgressDots current={step} total={TOTAL_STEPS} />

        <div className="glass-card rounded-2xl border border-white/5 p-8">
          {step === 1 && (
            <StepBrand brand={brand} onChange={updateBrand} onNext={goNext} />
          )}

          {step === 2 && (
            <StepTools
              onNext={handleToolsSkipOrNext}
              onBack={goBack}
              onSkip={handleSkipStep}
            />
          )}

          {step === 3 && (
            <StepCompetitors
              brandDescription={brand.description}
              onNext={goNext}
              onBack={goBack}
              onSkip={handleSkipStep}
              onCompetitorCount={setCompetitorCount}
            />
          )}

          {step === 4 && (
            <StepAnalyzing
              onNext={goNext}
              onBack={goBack}
              onAnalyticsResult={setAnalyticsResult}
            />
          )}

          {step === 5 && (
            <StepReady
              brandName={brand.name}
              toolsConnected={toolsConnected}
              competitorsTracked={competitorCount}
              onComplete={handleComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}
