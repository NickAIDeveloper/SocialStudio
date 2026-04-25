// src/app/api/analyze/run/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({
  getUserId: vi.fn().mockResolvedValue('u1'),
}));

const runAnalysisMock = vi.fn();
vi.mock('@/lib/analyze/run-analysis', () => ({
  runAnalysis: (...args: unknown[]) => runAnalysisMock(...args),
}));

import { POST } from '../route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost:3000/api/analyze/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'session=x' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyze/run', () => {
  beforeEach(() => {
    runAnalysisMock.mockReset();
  });

  it('returns 200 with the orchestrator result', async () => {
    runAnalysisMock.mockResolvedValue({
      generatedAt: '2026-04-25T00:00:00.000Z',
      brandId: 'b1',
      igUserId: null,
      steps: [],
      healthScore: 50,
      healthDelta: 5,
      summary: 'ok',
      analyticsInsights: [],
      competitorInsights: [],
      deepProfile: null,
    });
    const res = await POST(makeReq({ brandId: 'b1', igUserId: null }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.healthScore).toBe(50);
    expect(runAnalysisMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', brandId: 'b1', igUserId: null }),
      expect.any(Object),
    );
  });

  it('coerces missing brandId to null', async () => {
    runAnalysisMock.mockResolvedValue({
      generatedAt: 't', brandId: null, igUserId: null, steps: [],
      healthScore: null, healthDelta: null, summary: null,
      analyticsInsights: [], competitorInsights: [], deepProfile: null,
    });
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(200);
    expect(runAnalysisMock).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: null, igUserId: null }),
      expect.any(Object),
    );
  });

  it('returns 401 when getUserId throws Unauthorized', async () => {
    const { getUserId } = await import('@/lib/auth-helpers');
    vi.mocked(getUserId).mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(401);
  });
});
