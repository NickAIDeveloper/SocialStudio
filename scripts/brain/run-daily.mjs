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
    // Log the REASON too. Logging only the status is why `snapshot.ads: 200
    // failed` ran nightly for days without anyone learning that the Meta token
    // had expired.
    const detail = out.json?.reason ? ` (${out.json.reason})` : '';
    console.log(`  snapshot.${source}:`, out.status, `${out.json?.status ?? ''}${detail}`);
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
  // Audience research, BEFORE autopilot so a refresh lands in time to steer
  // today's post. The route self-gates on staleness, so this is a cheap no-op
  // on most days rather than a daily re-scrape.
  const research = await call(`/api/research/pain-points?brandId=${brandId}`, { runId });
  console.log(
    '  research:', research.status, research.json?.status ?? '',
    research.json?.reason ?? `(trusted=${research.json?.trusted ?? 0})`,
  );

  const forceParam = process.env.FORCE_AUTOPILOT === 'true' ? '&force=1' : '';
  const autopilot = await call(`/api/autopilot/run?brandId=${brandId}${forceParam}`, { runId, day });
  console.log('  autopilot:', autopilot.status, autopilot.json?.status ?? '', autopilot.json?.reason ?? autopilot.json?.postId ?? '');
}

async function syncAdInsights() {
  try {
    const result = await call('/api/ads/sync-insights', {});
    console.log(`[brain] sync-insights: status=${result.status} synced=${result.json?.synced ?? 0}`);
  } catch (err) {
    console.error('[brain] sync-insights failed:', err);
  }
}

async function refreshIgTokens() {
  // Proactively renew IG long-lived tokens BEFORE any brand work, so the
  // snapshot + autopilot steps below run against a fresh token. This is the
  // durable fix for "autopilot dies every week when the token expires".
  try {
    const out = await call('/api/meta/instagram/refresh-tokens', {});
    console.log(
      `[brain] ig-token refresh: status=${out.status} refreshed=${out.json?.refreshed ?? 0} skipped=${out.json?.skipped ?? 0} total=${out.json?.total ?? 0}`,
    );
    if (out.json?.failures?.length) {
      for (const f of out.json.failures.slice(0, 5)) {
        console.log(`    refresh failed: ${f.igUsername ?? f.id}`);
      }
    }
  } catch (err) {
    console.error('[brain] ig-token refresh failed:', err);
  }
}

async function checkChannelHealth() {
  // Buffer holds its OWN Instagram credential per channel and it expires. When
  // pacebrain.app's died on 2026-07-26 this cron kept succeeding for five days
  // while every post was silently dropped — nothing was looking at the channel.
  try {
    const out = await call('/api/autopilot/channel-health', {});
    console.log(
      `[brain] channel-health: status=${out.status} checked=${out.json?.checked ?? 0} blocked=${out.json?.blocked ?? 0}`,
    );
    for (const r of out.json?.reports ?? []) {
      if (r.state === 'blocked') {
        console.error(
          `    ⚠ ${r.slug} (${r.channel}): ${r.code} — broken ${r.outageDays}d. ${r.message}`,
        );
      } else if (r.state === 'warning' || r.state === 'unknown') {
        console.log(`    ${r.slug} (${r.channel}): ${r.code ?? r.state}`);
      }
    }
  } catch (err) {
    console.error('[brain] channel-health failed:', err);
  }
}

(async () => {
  const day = new Date().toISOString().slice(0, 10);
  await refreshIgTokens();
  await checkChannelHealth();
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

  // Sync live ad status + insight snapshots for all non-archived ads (best-effort).
  await syncAdInsights();
})();
