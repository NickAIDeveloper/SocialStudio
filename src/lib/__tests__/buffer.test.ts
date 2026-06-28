import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrganizationsAndChannels } from '../buffer';

// Minimal helper to build a fetch Response-like object.
function gqlResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'ERR',
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

describe('getOrganizationsAndChannels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches orgs then channels per-org (top-level channels query) with health flags', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const q: string = body.query;
      if (q.includes('organizations')) {
        return gqlResponse({ data: { account: { organizations: [{ id: 'org1', name: 'Origae' }] } } });
      }
      if (q.includes('channels(input')) {
        return gqlResponse({
          data: {
            channels: [
              { id: 'c1', name: 'pacebrain.app', service: 'instagram', avatar: 'a', isDisconnected: false, isLocked: false },
              { id: 'c2', name: 'affectly.app', service: 'instagram', avatar: 'b', isDisconnected: true, isLocked: false },
            ],
          },
        });
      }
      throw new Error(`unexpected query: ${q}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const orgs = await getOrganizationsAndChannels('key');
    expect(orgs).toHaveLength(1);
    expect(orgs[0].id).toBe('org1');
    expect(orgs[0].channels).toHaveLength(2);
    expect(orgs[0].channels[1].isDisconnected).toBe(true);
    // It must NOT use the nested organizations { channels } resolver (that's the broken path).
    const orgQueryCall = fetchMock.mock.calls.find((c) =>
      JSON.parse((c[1] as RequestInit).body as string).query.includes('organizations'),
    );
    expect(JSON.parse((orgQueryCall![1] as RequestInit).body as string).query).not.toContain('channels {');
  });

  it('does NOT throw when one org\'s channels are FORBIDDEN — that org returns empty, others survive', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      const q: string = body.query;
      if (q.includes('organizations')) {
        return gqlResponse({
          data: { account: { organizations: [{ id: 'orgBad', name: 'Origae' }, { id: 'orgGood', name: 'Other' }] } },
        });
      }
      if (q.includes('orgBad')) {
        // Buffer non-null propagation nulls data and returns a FORBIDDEN error.
        return gqlResponse({ data: null, errors: [{ message: 'Not authorized to access this resource', extensions: { code: 'FORBIDDEN' } }] });
      }
      if (q.includes('orgGood')) {
        return gqlResponse({ data: { channels: [{ id: 'cg', name: 'good', service: 'instagram', avatar: '', isDisconnected: false, isLocked: false }] } });
      }
      throw new Error(`unexpected query: ${q}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const orgs = await getOrganizationsAndChannels('key');
    expect(orgs).toHaveLength(2);
    expect(orgs.find((o) => o.id === 'orgBad')!.channels).toEqual([]);
    expect(orgs.find((o) => o.id === 'orgGood')!.channels).toHaveLength(1);
  });

  it('returns [] when the account has no organizations', async () => {
    const fetchMock = vi.fn(() => gqlResponse({ data: { account: { organizations: [] } } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getOrganizationsAndChannels('key')).toEqual([]);
  });
});
