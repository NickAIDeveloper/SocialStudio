import { createHmac, timingSafeEqual } from 'node:crypto';

export async function verifyBrainSignature(
  req: Request,
  rawBody: string
): Promise<boolean> {
  const sig = req.headers.get('x-brain-signature');
  const secret = process.env.BRAIN_CRON_SECRET;
  if (!sig || !secret) return false;

  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(sig, 'hex');
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(expected, provided);
}

export function signBrainBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}
