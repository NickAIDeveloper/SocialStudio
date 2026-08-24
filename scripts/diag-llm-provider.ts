// Which LLM is configured, and does a real generation work end to end through
// the shared client? Run after changing provider env vars.
//   npx tsx scripts/diag-llm-provider.ts          (uses .env.local)
//   npx tsx scripts/diag-llm-provider.ts --prod   (uses .env.vercel-production)
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: process.argv.includes('--prod') ? '.env.vercel-production' : '.env.local', override: true });

import { resolveLlmProvider } from '../src/lib/llm/provider';
import { llmChatCompletion } from '../src/lib/cerebras';

(async () => {
  const p = resolveLlmProvider();
  console.log(`\nprovider : ${p.name}`);
  console.log(`model    : ${p.model}`);
  console.log(`key      : ${p.apiKey ? 'set' : 'MISSING'}`);
  console.log(`url      : ${p.url}\n`);
  if (!p.apiKey) { console.log('No key — nothing to test.'); process.exit(1); }

  const t0 = Date.now();
  const out = await llmChatCompletion(
    [
      { role: 'system', content: 'You write Instagram captions for a running app. Reply as JSON.' },
      { role: 'user', content: 'Write one caption about a 5am run. JSON: {"caption":"...","hook":"..."}' },
    ],
    { responseFormat: 'json', maxTokens: 600, temperature: 0.8 },
  );
  const ms = Date.now() - t0;

  console.log(`returned ${out.length} chars in ${ms}ms`);
  if (!out.trim()) { console.log('EMPTY — the reasoning-token trap is back.'); process.exit(1); }
  try {
    const j = JSON.parse(out);
    console.log('parsed JSON OK:');
    console.log(`  hook   : ${j.hook}`);
    console.log(`  caption: ${String(j.caption).slice(0, 160)}`);
  } catch {
    console.log('NOT valid JSON:', out.slice(0, 200));
    process.exit(1);
  }
})().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
