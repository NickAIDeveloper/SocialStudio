import { createHmac, randomUUID } from 'node:crypto';

const SECRET = process.env.BRAIN_CRON_SECRET;
const BASE = process.env.BRAIN_BASE_URL;
if (!SECRET || !BASE) {
  console.error('BRAIN_CRON_SECRET and BRAIN_BASE_URL must be set');
  process.exit(1);
}

function sign(body) {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

async function call(path, body) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-brain-signature': sign(raw) },
    body: raw,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, json };
}

async function listBrands() {
  if (process.env.BRAIN_TEST_BRAND_ID) {
    return [{ id: process.env.BRAIN_TEST_BRAND_ID }];
  }
  const res = await fetch(`${BASE}/api/brain/brands`, {
    headers: { 'x-brain-signature': sign('') },
  });
  if (!res.ok) throw new Error(`listBrands ${res.status}`);
  return res.json();
}

function jitter(maxMs) {
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * maxMs)));
}

async function runOne(brandId, day) {
  const runId = randomUUID();
  console.log(`[brain] brand=${brandId} runId=${runId}`);

  for (const source of ['ig', 'ads', 'competitor_account']) {
    const out = await call(
      `/api/brain/snapshot?brandId=${brandId}&source=${source}`,
      { runId, day }
    );
    console.log(`  snapshot.${source}:`, out.status, out.json?.status ?? '');
  }
  const compute = await call(`/api/brain/compute?brandId=${brandId}`, { runId });
  console.log('  compute:', compute.status, compute.json?.status ?? '');
  const brief = await call(`/api/brain/brief?brandId=${brandId}`, { runId });
  console.log('  brief:', brief.status, brief.json?.status ?? '');
  const competitors = await call(`/api/competitors/sync?brandId=${brandId}`, { runId, day });
  console.log('  competitors:', competitors.status, competitors.json?.status ?? '', `(updated=${competitors.json?.updated ?? 0})`);
  if (competitors.json?.errors?.length) {
    for (const e of competitors.json.errors.slice(0, 5)) {
      console.log(`    error: ${e.handle} -> ${e.reason}`);
    }
  }
  const autopilot = await call(`/api/autopilot/run?brandId=${brandId}`, { runId, day });
  console.log('  autopilot:', autopilot.status, autopilot.json?.status ?? '', autopilot.json?.reason ?? autopilot.json?.postId ?? '');
}

(async () => {
  const day = new Date().toISOString().slice(0, 10);
  const brands = await listBrands();
  console.log(`[brain] daily run, ${brands.length} brands, day=${day}`);

  for (const brand of brands) {
    await jitter(30_000);
    try {
      await runOne(brand.id, day);
    } catch (err) {
      console.error(`[brain] brand ${brand.id} failed:`, err);
    }
  }
})();
