'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mic, Save, Loader2 } from 'lucide-react';

const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful' },
  { value: 'serious', label: 'Serious' },
];

const STYLE_OPTIONS = [
  { value: 'short_punchy', label: 'Short & Punchy' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'educational', label: 'Educational' },
];

interface Brand {
  id: string;
  name: string;
  slug: string;
  brandVoiceTone?: string | null;
  brandVoiceStyle?: string | null;
  brandVoiceDos?: string | null;
  brandVoiceDonts?: string | null;
}

export function BrandVoiceSettings() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [tone, setTone] = useState('neutral');
  const [style, setStyle] = useState('balanced');
  const [dos, setDos] = useState('');
  const [donts, setDonts] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBrandVoice = useCallback((brand: Brand) => {
    setTone(brand.brandVoiceTone ?? 'neutral');
    setStyle(brand.brandVoiceStyle ?? 'balanced');
    setDos(brand.brandVoiceDos ?? '');
    setDonts(brand.brandVoiceDonts ?? '');
  }, []);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/brands');
      if (!res.ok) return;
      const json = await res.json();
      const fetchedBrands: Brand[] = json.brands || [];
      setBrands(fetchedBrands);
      if (fetchedBrands.length > 0) {
        setSelectedBrandId(fetchedBrands[0].id);
        loadBrandVoice(fetchedBrands[0]);
      }
    } catch (err) {
      console.error('Failed to fetch brands:', err);
    } finally {
      setLoading(false);
    }
  }, [loadBrandVoice]);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId);
    setMessage(null);
    const brand = brands.find((b) => b.id === brandId);
    if (brand) {
      loadBrandVoice(brand);
    }
  };

  const handleSave = async () => {
    if (!selectedBrandId) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/brands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedBrandId,
          brandVoiceTone: tone,
          brandVoiceStyle: style,
          brandVoiceDos: dos,
          brandVoiceDonts: donts,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to save');
      }

      // Update local state so switching tabs reflects saved data
      setBrands((prev) =>
        prev.map((b) =>
          b.id === selectedBrandId
            ? { ...b, brandVoiceTone: tone, brandVoiceStyle: style, brandVoiceDos: dos, brandVoiceDonts: donts }
            : b
        )
      );

      setMessage({ type: 'success', text: 'Brand voice settings saved' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card rounded-xl border border-white/5 p-6 animate-pulse">
        <div className="h-5 w-40 rounded bg-zinc-700/50" />
        <div className="mt-2 h-4 w-64 rounded bg-zinc-700/30" />
        <div className="mt-6 space-y-4">
          <div className="h-10 w-full rounded bg-zinc-800/40" />
          <div className="h-10 w-full rounded bg-zinc-800/40" />
        </div>
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="glass-card rounded-xl border border-white/5 p-6">
        <p className="text-sm text-white">No brands found. Add a brand first to configure voice settings.</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
          <Mic className="h-5 w-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Brand Voice</h3>
          <p className="text-sm text-white">
            Configure how AI generates captions for each brand
          </p>
        </div>
      </div>

      {/* Brand selector tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-2">
        {brands.map((b) => (
          <button
            key={b.id}
            onClick={() => handleBrandChange(b.id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              selectedBrandId === b.id
                ? 'bg-zinc-800 text-teal-400 border-b-2 border-teal-400'
                : 'text-white hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">Style</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          >
            {STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white">
          Do&apos;s (things to always include)
        </label>
        <textarea
          value={dos}
          onChange={(e) => setDos(e.target.value)}
          placeholder="e.g., call-to-action, brand hashtag, community questions"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
        />
        <p className="text-xs text-white">Comma-separated list of things AI should include in captions</p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white">
          Don&apos;ts (things to avoid)
        </label>
        <textarea
          value={donts}
          onChange={(e) => setDonts(e.target.value)}
          placeholder="e.g., slang, technical jargon, competitor mentions"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
        />
        <p className="text-xs text-white">Comma-separated list of things AI should avoid in captions</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Brand Voice'}
        </button>

        {message && (
          <p
            className={`text-sm ${
              message.type === 'success' ? 'text-teal-400' : 'text-red-400'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
