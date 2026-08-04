import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({ getUserId: async () => 'u1' }));
vi.mock('@/lib/creative/genome-read', () => ({
  loadSamplableIngredients: async () => [
    { id: 'f1', dimension: 'framework', value: 'PAS', promptFragment: 'x' },
    { id: 'f2', dimension: 'framework', value: 'AIDA', promptFragment: 'y' },
  ],
  refreshScores: async () => [
    { ingredientId: 'f1', surface: 'ads', n: 12, meanReward: 0.02, shrunkScore: 0.018, borrowed: false },
    { ingredientId: 'f2', surface: 'ads', n: 1, meanReward: 0.09, shrunkScore: 0.03, borrowed: true },
  ],
}));

import { GET } from '../route';

describe('GET /api/creative/genome', () => {
  it('groups ingredients by dimension', async () => {
    const res = await GET(new Request('http://x/api/creative/genome?surface=ads'));
    const json = await res.json();
    expect(json.dimensions[0].dimension).toBe('framework');
    expect(json.dimensions[0].ingredients).toHaveLength(2);
  });

  it('ranks well-sampled ingredients above thin ones', async () => {
    // Same discipline as the /ask fix: a reader scans top-down and acts on
    // what heads the list, so a one-observation result must not lead it.
    const res = await GET(new Request('http://x/api/creative/genome?surface=ads'));
    const json = await res.json();
    expect(json.dimensions[0].ingredients[0].value).toBe('PAS');
  });

  it('surfaces which scores lean on a borrowed prior', async () => {
    const res = await GET(new Request('http://x/api/creative/genome?surface=ads'));
    const json = await res.json();
    const aida = json.dimensions[0].ingredients.find((i: { value: string }) => i.value === 'AIDA');
    expect(aida.borrowed).toBe(true);
  });

  it('rejects an unknown surface rather than guessing', async () => {
    const res = await GET(new Request('http://x/api/creative/genome?surface=nonsense'));
    expect(res.status).toBe(400);
  });
});
