'use client';
import { useEffect, useState } from 'react';
import { BrandPanel } from './brand-panel';

interface Brand {
  id: string;
  name: string;
}

export function AutopilotSection() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`brands ${r.status}`))))
      .then((d) => setBrands(d.brands ?? []))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-zinc-900/40" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-900/40" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-300">
        Failed to load brands: {err}
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-zinc-300">No brands yet.</p>
        <p className="mt-1 text-xs text-zinc-500">
          Add a brand in <a href="/settings" className="text-teal-300 underline">Settings</a> to switch on autopilot.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {brands.map((b) => (
        <BrandPanel key={b.id} brandId={b.id} brandName={b.name} />
      ))}
    </div>
  );
}
