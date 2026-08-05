import { describe, it, expect } from 'vitest';
import { resolveIgForBrand } from '@/lib/brand-ig';

const BRANDS = [
  { id: 'b1', name: 'Affectly', slug: 'affectly', instagramHandle: '@affectly' },
  { id: 'b2', name: 'PaceBrain', slug: 'pacebrain', instagramHandle: 'PaceBrain' },
  { id: 'b3', name: 'No Handle', slug: 'no-handle', instagramHandle: null },
];

const ACCOUNTS = [
  { igUserId: '111', igUsername: 'affectly' },
  { igUserId: '222', igUsername: 'pacebrain' },
];

describe('resolveIgForBrand', () => {
  it('returns null when no brand is selected', () => {
    expect(resolveIgForBrand(null, BRANDS, ACCOUNTS)).toBeNull();
  });

  it('strips a leading @ and matches case-insensitively', () => {
    expect(resolveIgForBrand('b1', BRANDS, ACCOUNTS)).toBe('111');
    expect(resolveIgForBrand('b2', BRANDS, ACCOUNTS)).toBe('222');
  });

  it('returns null when the brand carries no handle', () => {
    expect(resolveIgForBrand('b3', BRANDS, ACCOUNTS)).toBeNull();
  });

  it('returns null when the handle is not among connected accounts', () => {
    expect(resolveIgForBrand('b1', BRANDS, [{ igUserId: '999', igUsername: 'other' }])).toBeNull();
  });

  it('returns null for an unknown brand id', () => {
    expect(resolveIgForBrand('nope', BRANDS, ACCOUNTS)).toBeNull();
  });
});
