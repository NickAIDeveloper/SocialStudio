'use client';

import { useEffect, useState } from 'react';
import { ResearchPanel } from './research-panel';

interface Brand {
  id: string;
  slug: string;
  name: string | null;
}

export function ResearchSection() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`brands ${r.status}`))))
      .then((d) => setBrands(d.brands ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-400">
        Failed to load brands: {err}
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5 text-sm text-(--muted)">
        No brands yet. Add one first and research will run against it.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {brands.map((b) => (
        <ResearchPanel key={b.id} brandId={b.id} brandName={b.name ?? b.slug} />
      ))}
    </div>
  );
}
