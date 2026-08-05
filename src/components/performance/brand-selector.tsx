'use client';

import { useState, useEffect, useRef } from 'react';

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  instagramHandle?: string | null;
}

interface BrandSelectorProps {
  value: string | null;
  onChange: (id: string | null) => void;
  /** Pick the first brand automatically when nothing is selected yet. */
  autoSelectFirst?: boolean;
  /** Fires once the brand list has loaded, so the parent can avoid a second fetch. */
  onLoaded?: (brands: BrandRow[]) => void;
}

export function BrandSelector({
  value,
  onChange,
  autoSelectFirst = false,
  onLoaded,
}: BrandSelectorProps) {
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Callbacks and the current selection live in refs so the fetch effect can
  // run exactly once on mount without going stale.
  const onChangeRef = useRef(onChange);
  const onLoadedRef = useRef(onLoaded);
  const valueRef = useRef(value);
  onChangeRef.current = onChange;
  onLoadedRef.current = onLoaded;
  valueRef.current = value;

  useEffect(() => {
    fetch('/api/brands')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { brands?: BrandRow[] } | null) => {
        const rows = data?.brands ?? [];
        setBrands(rows);
        onLoadedRef.current?.(rows);
        if (autoSelectFirst && !valueRef.current && rows[0]) {
          onChangeRef.current(rows[0].id);
        }
      })
      .catch(() => {
        // swallow; show empty state
      })
      .finally(() => setLoading(false));
    // Mount-only: re-fetching on every selection change would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = !loading && brands.length === 0;

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-(--muted) whitespace-nowrap">Brand</label>
      <select
        disabled={loading || empty}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-(--line) bg-(--bg) px-3 py-1.5 text-sm text-(--txt) focus:border-(--violet) focus:outline-none disabled:opacity-50"
      >
        <option value="">
          {loading ? 'Loading...' : empty ? 'No brands' : 'All brands'}
        </option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {empty && (
        <span className="text-sm text-(--muted)">
          No brands yet. Add one in Settings to see your own numbers.
        </span>
      )}
    </div>
  );
}
