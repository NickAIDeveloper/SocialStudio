// Read-only: what does META say about our ads right now?
//
// meta_ads.status is written only by our own app (publish / activate), so it is
// structurally incapable of noticing a change made in Ads Manager, by a Meta
// automated rule, or by a scheduled ad set start. This asks Meta instead, and
// checks lifetime spend so "is it costing money" is answered by the ledger
// rather than by a status field.
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: false });

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { metaAccounts, users } from '../src/lib/db/schema';
import { decrypt } from '../src/lib/encryption';

const V = process.env.META_API_VERSION ?? 'v21.0';
const BASE = `https://graph.facebook.com/${V}`;
const email = process.argv[2] ?? 'origae@socialstudio.app';

const sql = neon(process.env.NEON_DB_URL!);
const db = drizzle(sql);

async function g(path: string, token: string, params = ''): Promise<any> {
  const res = await fetch(`${BASE}${path}?access_token=${encodeURIComponent(token)}${params}`);
  return res.json();
}

(async () => {
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) { console.error('user not found:', email); process.exit(1); }
  const [acct] = await db.select().from(metaAccounts).where(eq(metaAccounts.userId, u.id)).limit(1);
  if (!acct?.accessToken) { console.error('no metaAccounts row'); process.exit(1); }
  const token = decrypt(acct.accessToken);
  const assets = (acct.assets as { adAccounts?: { id: string }[] } | null) ?? {};
  const adAccountId = assets.adAccounts?.[0]?.id ?? '';

  const acctInfo = await g(`/${adAccountId}`, token,
    '&fields=name,account_status,amount_spent,balance,currency,spend_cap');
  console.log('=== AD ACCOUNT ===');
  console.log(JSON.stringify(acctInfo, null, 2));

  const ads = await g(`/${adAccountId}/ads`, token,
    '&fields=id,name,status,effective_status,created_time,updated_time,' +
    'adset{id,name,status,effective_status,daily_budget,start_time,end_time},' +
    'campaign{id,name,status,effective_status}&limit=50');
  console.log('\n=== ALL ADS AT META ===');
  for (const a of (ads.data ?? [])) {
    console.log(`\nad ${a.id}  "${a.name}"`);
    console.log(`  ad       status=${a.status}  effective=${a.effective_status}`);
    console.log(`  adset    status=${a.adset?.status}  effective=${a.adset?.effective_status}  budget=${a.adset?.daily_budget}  start=${a.adset?.start_time}  end=${a.adset?.end_time}`);
    console.log(`  campaign status=${a.campaign?.status}  effective=${a.campaign?.effective_status}`);
    console.log(`  updated=${a.updated_time}`);
  }
  if (ads.error) console.log('ERROR:', JSON.stringify(ads.error));

  const ins = await g(`/${adAccountId}/insights`, token,
    '&level=ad&date_preset=maximum&fields=ad_id,ad_name,spend,impressions,clicks&limit=50');
  console.log('\n=== LIFETIME SPEND (level=ad) ===');
  console.log(JSON.stringify(ins.data ?? ins, null, 2));
})();
