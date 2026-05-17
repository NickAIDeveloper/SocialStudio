'use client';
import { useEffect, useState } from 'react';
import { AutopilotCard } from './autopilot-card';
import { AutopilotInsightsCard } from './autopilot-insights-card';

interface Brand {
  id: string;
  name: string;
}

export function AutopilotSection() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBrands() {
      try {
        const res = await fetch('/api/brands');
        if (!res.ok) throw new Error(`fetch brands ${res.status}`);
        const json = await res.json();
        setBrands(json.brands ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchBrands();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Autopilot</h2>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5 animate-pulse">
          <div className="h-4 w-40 rounded bg-zinc-700/50" />
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Autopilot</h2>
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          Failed to load brands: {err}
        </div>
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Autopilot</h2>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-5 text-sm text-zinc-400">
          No brands found. Add a brand first to configure autopilot.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Autopilot</h2>
        <p className="text-sm text-zinc-400 mt-0.5">
          Automatically generate and schedule posts for each brand.
        </p>
      </div>
      {brands.map((brand) => (
        <div key={brand.id} className="space-y-3">
          <AutopilotInsightsCard brandId={brand.id} brandName={brand.name} />
          <AutopilotCard brandId={brand.id} brandName={brand.name} />
        </div>
      ))}
    </div>
  );
}
