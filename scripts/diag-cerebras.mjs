// Direct Cerebras probe: calls the same model + JSON-shaped prompt the captions
// route uses, and reports whether it returns a parseable, non-empty caption.
// Pinpoints "empty_generation" to the LLM vs the parsing/sanitize layer.

import { readFileSync } from 'node:fs';

const ENV_FILE = process.env.ENV_FILE || '.env.vercel-production';
function loadEnv(file) {
  const out = {};
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv(ENV_FILE);
const KEY = process.env.CEREBUS || env.CEREBUS;
const MODEL = process.env.CEREBRAS_MODEL || env.CEREBRAS_MODEL || 'gpt-oss-120b';
if (!KEY) { console.error('No CEREBUS key'); process.exit(1); }

const URL = 'https://api.cerebras.ai/v1/chat/completions';

async function call(label, messages, opts = {}) {
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.9,
      max_tokens: opts.maxTokens ?? 600,
    }),
  });
  const text = await res.text();
  console.log(`\n[${label}] HTTP ${res.status} (${Date.now() - t0}ms) model=${MODEL}`);
  if (!res.ok) {
    console.log(`  ERROR body: ${text.slice(0, 500)}`);
    return null;
  }
  let json;
  try { json = JSON.parse(text); } catch { console.log(`  unparseable body: ${text.slice(0, 300)}`); return null; }
  const content = json.choices?.[0]?.message?.content ?? '';
  const finish = json.choices?.[0]?.finish_reason;
  console.log(`  finish_reason: ${finish}`);
  console.log(`  content.length: ${content.length}`);
  console.log(`  content (first 400): ${JSON.stringify(content.slice(0, 400))}`);
  return content;
}

// 1. Sanity: does the model exist / respond at all?
await call('sanity', [
  { role: 'user', content: 'Reply with the single word: OK' },
], { maxTokens: 10, temperature: 0 });

// 2. The actual captions-style JSON request.
const content = await call('captions-json', [
  { role: 'system', content: 'You are an elite Instagram copywriter. Reply with ONLY a JSON object. No other text.' },
  { role: 'user', content: `Write a short Instagram post for "Affectly", an emotion-aware study app.
Return ONLY valid JSON:
{"caption":"full multi-line caption with hook plus body plus CTA","hashtags":"#a #b #c #d #e","hookText":"3-6 word hook"}` },
], { maxTokens: 600, temperature: 0.9 });

// 3. Mirror the captions route parse to see if caption survives.
if (content != null) {
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/^[^{]*/, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  let parsed = null;
  if (jsonMatch) {
    for (const attempt of [jsonMatch[0], jsonMatch[0].replace(/,\s*}/g, '}')]) {
      try { parsed = JSON.parse(attempt); break; } catch {}
    }
  }
  console.log(`\n[parse] parsed.caption.length = ${parsed?.caption?.length ?? '(parse failed / no caption)'}`);
  console.log(`[parse] parsed.hookText = ${JSON.stringify(parsed?.hookText ?? null)}`);
}
console.log('\nDone.\n');
