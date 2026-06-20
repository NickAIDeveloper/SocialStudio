// Read-only diagnostic: shows every connected Instagram account, when its
// long-lived token expires, which one autopilot would pick, and a LIVE probe
// of graph.instagram.com/me to prove whether the token is alive or dead.
//
// Usage: node scripts/diag-ig-tokens.mjs            (uses .env.vercel-production)
//        ENV_FILE=.env.local node scripts/diag-ig-tokens.mjs
//
// Does NOT print or persist any token. Makes one GET /me per account.

import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const ENV_FILE = process.env.ENV_FILE || '.env.vercel-production';

function loadEnv(file) {
  const out = {};
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv(ENV_FILE);
const NEON_DB_URL = process.env.NEON_DB_URL || env.NEON_DB_URL;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || env.ENCRYPTION_KEY;

if (!NEON_DB_URL) {
  console.error(`No NEON_DB_URL in ${ENV_FILE} or process.env`);
  process.exit(1);
}

function decrypt(ciphertext) {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) return null;
  try {
    const [ivB64, tagB64, dataB64] = ciphertext.split(':');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const d = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    d.setAuthTag(tag);
    let out = d.update(dataB64, 'base64', 'utf8');
    out += d.final('utf8');
    return out;
  } catch {
    return null;
  }
}

function fmtDate(d) {
  return d ? new Date(d).toISOString() : '(null)';
}
function daysFromNow(d) {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000);
}

async function probe(token) {
  if (!token) return 'no-token (decrypt failed — check ENCRYPTION_KEY)';
  try {
    const u = new URL('https://graph.instagram.com/me');
    u.searchParams.set('fields', 'username,account_type');
    u.searchParams.set('access_token', token);
    const res = await fetch(u);
    const body = await res.text();
    if (res.ok) {
      const j = JSON.parse(body);
      return `ALIVE  (@${j.username}, ${j.account_type})`;
    }
    let msg = body;
    try {
      msg = JSON.parse(body).error?.message ?? body;
    } catch {}
    return `DEAD   (${res.status}: ${msg})`;
  } catch (e) {
    return `probe error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const sql = neon(NEON_DB_URL);

const rows = await sql`
  SELECT id, ig_user_id, ig_username, user_id, access_token,
         token_expires_at, connected_at, updated_at
  FROM instagram_accounts
  ORDER BY user_id, updated_at DESC
`;

console.log(`\nConnected Instagram accounts: ${rows.length} (db=${ENV_FILE})\n`);

// Autopilot picks the FIRST row per user (limit 1, no explicit order → first
// returned). We sort by user_id so the first per user here approximates that.
const seenUser = new Set();

for (const r of rows) {
  const days = daysFromNow(r.token_expires_at);
  const isAutopilotPick = !seenUser.has(r.user_id);
  seenUser.add(r.user_id);

  console.log(`@${r.ig_username ?? '(no username)'}  ig_user_id=${r.ig_user_id}`);
  console.log(`  user_id         : ${r.user_id}`);
  console.log(`  token_expires_at: ${fmtDate(r.token_expires_at)}  (${days == null ? 'unknown' : days + ' days from now'})`);
  console.log(`  connected_at    : ${fmtDate(r.connected_at)}`);
  console.log(`  updated_at      : ${fmtDate(r.updated_at)}`);
  console.log(`  autopilot uses? : ${isAutopilotPick ? 'YES (first for this user)' : 'no'}`);
  const live = await probe(decrypt(r.access_token));
  console.log(`  live /me probe  : ${live}`);
  console.log('');
}

console.log('Done.\n');
