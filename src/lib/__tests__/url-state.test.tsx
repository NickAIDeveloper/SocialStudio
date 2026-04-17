import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHubState } from '@/lib/url-state';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

const mockReplace = vi.fn();
let mockSearchParamsString = '';
let mockPathname = '/analytics';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUrl(params: Record<string, string>) {
  mockSearchParamsString = new URLSearchParams(params).toString();
}

function clearUrl() {
  mockSearchParamsString = '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHubState', () => {
  beforeEach(() => {
    clearUrl();
    mockReplace.mockClear();
    localStorage.clear();
  });

  // 1. Initial `source` reads from URL params
  it('reads source from URL params', () => {
    setUrl({ source: 'meta', brand: 'brand-123', ig: 'ig-456' });
    const { result } = renderHook(() => useHubState());
    expect(result.current.source).toBe('meta');
    expect(result.current.brand).toBe('brand-123');
    expect(result.current.ig).toBe('ig-456');
  });

  // 2. setSource('meta') calls router.replace with source=meta
  it('setSource triggers router.replace with updated source param', () => {
    clearUrl();
    const { result } = renderHook(() => useHubState());

    act(() => {
      result.current.setSource('meta');
    });

    expect(mockReplace).toHaveBeenCalledOnce();
    const [url, opts] = mockReplace.mock.calls[0] as [string, { scroll: boolean }];
    expect(url).toContain('source=meta');
    expect(opts).toEqual({ scroll: false });
    // localStorage should also be updated
    expect(localStorage.getItem('hub.source')).toBe('meta');
  });

  // 3. URL empty + localStorage has hub.source=meta → returns 'meta'
  it('falls through to localStorage when URL has no source', () => {
    clearUrl();
    localStorage.setItem('hub.source', 'meta');
    const { result } = renderHook(() => useHubState());
    expect(result.current.source).toBe('meta');
  });

  // 4. Both URL and localStorage empty, opts.defaults = { source: 'meta' } → returns 'meta'
  it('uses opts.defaults when URL and localStorage are both empty', () => {
    clearUrl();
    const { result } = renderHook(() => useHubState({ defaults: { source: 'meta' } }));
    expect(result.current.source).toBe('meta');
  });

  // 5. All three sources silent → returns 'scrape'
  it('returns hardcoded default scrape when all sources are silent', () => {
    clearUrl();
    const { result } = renderHook(() => useHubState());
    expect(result.current.source).toBe('scrape');
    expect(result.current.brand).toBeNull();
    expect(result.current.ig).toBeNull();
  });

  // 6. Invalid URL source is ignored; falls through
  it('ignores invalid URL source and falls through to localStorage then default', () => {
    setUrl({ source: 'bogus' });
    // No localStorage set → should fall to hardcoded default
    const { result } = renderHook(() => useHubState());
    expect(result.current.source).toBe('scrape');
  });

  it('ignores invalid URL source and falls through to localStorage value', () => {
    setUrl({ source: 'bogus' });
    localStorage.setItem('hub.source', 'meta');
    const { result } = renderHook(() => useHubState());
    expect(result.current.source).toBe('meta');
  });

  // 7. setBrand(null) removes param and localStorage key
  it('setBrand(null) deletes brand from URL and localStorage', () => {
    setUrl({ source: 'meta', brand: 'old-brand' });
    localStorage.setItem('hub.brand', 'old-brand');

    const { result } = renderHook(() => useHubState());

    act(() => {
      result.current.setBrand(null);
    });

    expect(mockReplace).toHaveBeenCalledOnce();
    const [url] = mockReplace.mock.calls[0] as [string, unknown];
    // brand should NOT be in the resulting URL
    expect(url).not.toContain('brand=');
    // localStorage key should be removed
    expect(localStorage.getItem('hub.brand')).toBeNull();
  });

  // Additional: setSource('scrape') leaves ig param in URL untouched
  it('setSource(scrape) does not clear the ig param', () => {
    setUrl({ source: 'meta', ig: 'ig-789' });
    const { result } = renderHook(() => useHubState());

    act(() => {
      result.current.setSource('scrape');
    });

    const [url] = mockReplace.mock.calls[0] as [string, unknown];
    expect(url).toContain('source=scrape');
    expect(url).toContain('ig=ig-789');
  });

  // Additional: setBrand with a value sets localStorage and includes param
  it('setBrand(id) sets localStorage and includes brand in URL', () => {
    clearUrl();
    const { result } = renderHook(() => useHubState());

    act(() => {
      result.current.setBrand('brand-abc');
    });

    const [url] = mockReplace.mock.calls[0] as [string, unknown];
    expect(url).toContain('brand=brand-abc');
    expect(localStorage.getItem('hub.brand')).toBe('brand-abc');
  });
});
