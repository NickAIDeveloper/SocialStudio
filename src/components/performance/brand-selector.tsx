'use client';

import { useState, useEffect } from 'react';

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
}

interface BrandSelectorProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function BrandSelector({ value, onChange }: BrandSelectorProps) {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { brands?: BrandRow[] } | null) => {
        setBrands(data?.brands ?? []);
      })
      .catch(() => {
        // swallow; show empty state
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-zinc-400 whitespace-nowrap">Brand</label>
      <select
        disabled={loading}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">{loading ? 'Loading...' : brands.length === 0 ? 'No brands' : 'All brands'}</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
