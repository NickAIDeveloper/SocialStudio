// src/lib/brand-ig.ts
//
// Brands map 1:1 to Instagram accounts via their free-text `instagramHandle`
// field. Every surface that lets the user pick a brand needs the same
// resolution so the Meta-backed steps (deep profile, insights) actually run.

export interface BrandLite {
  id: string;
  instagramHandle?: string | null;
}

export interface IgAccountLite {
  igUserId: string;
  igUsername: string | null;
}

/**
 * Resolve the connected IG account that belongs to a given brand.
 * Returns null when nothing is selected, the brand has no handle, or the
 * handle is not among the user's connected accounts.
 */
export function resolveIgForBrand(
  brandId: string | null,
  brands: BrandLite[],
  accounts: IgAccountLite[],
): string | null {
  if (!brandId) return null;
  const brand = brands.find((b) => b.id === brandId);
  if (!brand?.instagramHandle) return null;
  const handle = brand.instagramHandle.replace(/^@/, '').toLowerCase();
  const account = accounts.find((a) => a.igUsername?.toLowerCase() === handle);
  return account?.igUserId ?? null;
}
