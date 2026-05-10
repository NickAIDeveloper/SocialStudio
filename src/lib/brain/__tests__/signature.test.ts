import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyBrainSignature } from '../auth';

const SECRET = 'test-secret-do-not-use-in-prod';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

function makeReq(body: string, sig: string | null): Request {
  const headers = new Headers();
  if (sig !== null) headers.set('x-brain-signature', sig);
  return new Request('http://x/api/brain/snapshot', {
    method: 'POST',
    headers,
    body,
  });
}

describe('verifyBrainSignature', () => {
  beforeEach(() => {
    process.env.BRAIN_CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.BRAIN_CRON_SECRET;
  });

  it('accepts a valid signature', async () => {
    const body = JSON.stringify({ runId: 'r1', day: '2026-05-09' });
    const req = makeReq(body, sign(body));
    expect(await verifyBrainSignature(req, body)).toBe(true);
  });

  it('rejects a missing signature header', async () => {
    const body = '{}';
    const req = makeReq(body, null);
    expect(await verifyBrainSignature(req, body)).toBe(false);
  });

  it('rejects a tampered body', async () => {
    const body = JSON.stringify({ runId: 'r1', day: '2026-05-09' });
    const sig = sign(body);
    const tampered = JSON.stringify({ runId: 'r1', day: '2026-05-10' });
    const req = makeReq(tampered, sig);
    expect(await verifyBrainSignature(req, tampered)).toBe(false);
  });

  it('rejects when BRAIN_CRON_SECRET is not set', async () => {
    delete process.env.BRAIN_CRON_SECRET;
    const body = '{}';
    const req = makeReq(body, sign(body));
    expect(await verifyBrainSignature(req, body)).toBe(false);
  });
});
