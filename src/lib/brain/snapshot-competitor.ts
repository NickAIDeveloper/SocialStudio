import type { SnapshotResponse } from './types';

export interface CompetitorRecord {
  id: string;
  handle: string;
  followerCount: number | null;
  postCount: number | null;
}

export interface SnapshotCompetitorInput {
  brandId: string;
  competitors: CompetitorRecord[]; // already-fetched scrapedAccounts rows
  persist?: (payload: { competitors: CompetitorRecord[] }) => Promise<void>;
}

// v1: account-level only. Reads from scrapedAccounts (already populated by
// existing scrape pipeline). Per-post competitor data is subsystem #2.
export async function snapshotCompetitor(
  input: SnapshotCompetitorInput
): Promise<SnapshotResponse> {
  if (input.competitors.length === 0) {
    return { status: 'skipped', reason: 'no_competitors_configured' };
  }

  await input.persist?.({ competitors: input.competitors });
  return { status: 'ok', sampleSize: input.competitors.length };
}
