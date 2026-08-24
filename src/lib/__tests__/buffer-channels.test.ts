// Regression guard for the FORBIDDEN nested-channels query.
//
// Buffer's organizations.channels resolver returns "Not authorized to access
// this resource", and because the field is non-null that error propagates over
// the whole response — so asking for channels inside organizations breaks the
// ENTIRE call. getChannelHealth was moved to the top-level channels(input:)
// query for this reason; getOrganizationsAndChannels was missed, which silently
// broke the calendar, linked accounts, the default-channel picker and the queue
// view. These tests pin the two-query shape so it can't regress.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getOrganizationsAndChannels } from '../buffer';

const okJson = (data: unknown) =>
  ({ ok: true, status: 200, json: () => Promise.resolve({ data }) }) as unknown as Response;

afterEach(() => vi.unstubAllGlobals());

describe('getOrganizationsAndChannels', () => {
  it('never asks for channels nested inside organizations', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      const query = JSON.parse(String(init.body)).query as string;
      calls.push(query);
      if (query.includes('organizations')) {
        return Promise.resolve(okJson({ account: { organizations: [{ id: 'org1', name: 'Origae' }] } }));
      }
      return Promise.resolve(okJson({ channels: [{ id: 'c1', name: 'affectly', service: 'instagram', avatar: 'a.png' }] }));
    }));

    await getOrganizationsAndChannels('key');

    const orgQuery = calls.find((q) => q.includes('organizations'))!;
    // The whole point: the org query must NOT contain a channels selection.
    expect(orgQuery).not.toMatch(/channels/);
    expect(calls.some((q) => q.includes('channels(input:'))).toBe(true);
  });

  it('returns each organization with its channels attached', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      const query = JSON.parse(String(init.body)).query as string;
      if (query.includes('organizations')) {
        return Promise.resolve(okJson({ account: { organizations: [{ id: 'org1', name: 'Origae' }] } }));
      }
      return Promise.resolve(okJson({
        channels: [
          { id: 'c1', name: 'affectly.app', service: 'instagram', avatar: 'a.png' },
          { id: 'c2', name: 'pacebrain.app', service: 'instagram', avatar: 'b.png' },
        ],
      }));
    }));

    const orgs = await getOrganizationsAndChannels('key');

    expect(orgs).toHaveLength(1);
    expect(orgs[0]).toMatchObject({ id: 'org1', name: 'Origae' });
    expect(orgs[0].channels.map((c) => c.name)).toEqual(['affectly.app', 'pacebrain.app']);
  });

  it('survives an organization that has no channels', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      const query = JSON.parse(String(init.body)).query as string;
      if (query.includes('organizations')) {
        return Promise.resolve(okJson({ account: { organizations: [{ id: 'org1', name: 'Empty' }] } }));
      }
      return Promise.resolve(okJson({ channels: null }));
    }));

    const orgs = await getOrganizationsAndChannels('key');
    expect(orgs[0].channels).toEqual([]);
  });
});
