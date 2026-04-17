'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HubSource = 'meta' | 'scrape';

export interface HubState {
  source: HubSource;
  brand: string | null;
  ig: string | null;
}

export interface HubStateSetters {
  setSource(s: HubSource): void;
  setBrand(b: string | null): void;
  setIg(ig: string | null): void;
}

export interface UseHubStateOptions {
  defaults?: Partial<HubState>;
}

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

const LS_SOURCE = 'hub.source';
const LS_BRAND = 'hub.brand';
const LS_IG = 'hub.ig';

const VALID_SOURCES: HubSource[] = ['meta', 'scrape'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lsGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore quota / private-mode errors
  }
}

function isValidSource(v: string | null): v is HubSource {
  return v !== null && (VALID_SOURCES as string[]).includes(v);
}

/** Resolve a single param using the hydration order: URL → localStorage → opts.defaults → hardcoded. */
function resolveSource(
  urlValue: string | null,
  defaultValue?: HubSource,
): HubSource {
  if (isValidSource(urlValue)) return urlValue;
  const ls = lsGet(LS_SOURCE);
  if (isValidSource(ls)) return ls;
  if (defaultValue !== undefined) return defaultValue;
  return 'scrape';
}

function resolveNullable(
  urlValue: string | null,
  lsKey: string,
  defaultValue?: string | null,
): string | null {
  if (urlValue !== null) return urlValue || null; // empty string → null
  const ls = lsGet(lsKey);
  if (ls !== null) return ls;
  if (defaultValue !== undefined) return defaultValue;
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHubState(opts?: UseHubStateOptions): HubState & HubStateSetters {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // --- Read current state from searchParams (reactive) ---
  const urlSource = searchParams.get('source');
  const urlBrand = searchParams.get('brand');
  const urlIg = searchParams.get('ig');

  const source = resolveSource(urlSource, opts?.defaults?.source);
  const brand = resolveNullable(urlBrand, LS_BRAND, opts?.defaults?.brand);
  const ig = resolveNullable(urlIg, LS_IG, opts?.defaults?.ig);

  // --- Setter helpers ---

  /** Build a new URLSearchParams from current params, mutating the given key. */
  const buildParams = useCallback(
    (key: string, value: string | null): URLSearchParams => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    },
    [searchParams],
  );

  const setSource = useCallback(
    (s: HubSource) => {
      lsSet(LS_SOURCE, s);
      const next = buildParams('source', s);
      router.replace(pathname + '?' + next.toString(), { scroll: false });
    },
    [buildParams, pathname, router],
  );

  const setBrand = useCallback(
    (b: string | null) => {
      lsSet(LS_BRAND, b);
      const next = buildParams('brand', b);
      router.replace(pathname + '?' + next.toString(), { scroll: false });
    },
    [buildParams, pathname, router],
  );

  const setIg = useCallback(
    (igValue: string | null) => {
      lsSet(LS_IG, igValue);
      const next = buildParams('ig', igValue);
      router.replace(pathname + '?' + next.toString(), { scroll: false });
    },
    [buildParams, pathname, router],
  );

  return { source, brand, ig, setSource, setBrand, setIg };
}
