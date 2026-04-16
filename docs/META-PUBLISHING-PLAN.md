# Meta App Publishing — Resume Plan

Target: get the GoViraleza Meta app published + through App Review so real
users can authorize Facebook at `/meta` and read ads insights.

- **App:** GoViraleza (App ID `2118925715617016`)
- **Deployed domain:** `https://goviraleza.com`
- **Dev console:** https://developers.facebook.com/apps/2118925715617016/
- **Current status:** Unpublished (Dev Mode — only testers can authorize)

---

## Done — do not redo

- [x] Meta integration code complete (schema, OAuth routes, client, hub UI)
- [x] Merged `develop` → `main` (Vercel prod deploy live)
- [x] Verified `/data-deletion` is publicly accessible on prod (HTTP 200, no login redirect)
- [x] **Basic Settings saved in Meta console:**
  - App domain: `goviraleza.com`
  - Privacy policy URL: `https://goviraleza.com/privacy`
  - Terms of Service URL: `https://goviraleza.com/terms`
  - Data deletion URL: `https://goviraleza.com/data-deletion`
- [x] **Facebook Login for Business configured:**
  - Valid OAuth Redirect URI: `https://goviraleza.com/api/meta/oauth/callback`
  - Client OAuth login: Yes / Web OAuth login: Yes / Enforce HTTPS: Yes / Strict mode: Yes
- [x] **Eliminated `META_OAUTH_REDIRECT_URI` env var dependency** (commit `c606bdc`). OAuth routes now derive the redirect URI from `req.nextUrl.origin`, so the same code works on localhost, preview, and prod with zero per-env configuration. Also accepts `FB_APP_ID` / `FB_APP_SECRET` as aliases.

## Current Meta app status (as observed)

Marketing API use case already has **"Ready for testing"** status for:
- `ads_management`
- `ads_read`
- `business_management`
- `pages_read_engagement`
- `Ads Management Standard Access` (feature)

Meaning: once you add yourself as a tester, you can authorize the app in Dev Mode and those scopes will grant immediately — no App Review needed for testing.

---

## Immediate next step

### 1. Wait for Vercel to deploy commit `c606bdc`

That commit removes the redirect-URI env-var requirement. Once live, the OAuth flow works end-to-end without touching Vercel env settings.

```bash
# Watch for the deploy
curl -sI https://goviraleza.com/api/meta/oauth/start | head -3
# Before deploy: 500 (env var missing)
# After deploy:  302 or 401 (depending on auth state)
```

### 2. Add yourself as an App Tester

Navigate to `https://developers.facebook.com/apps/2118925715617016/roles/roles/` and add your personal Facebook account under **Testers** or **Developers**. Only users in this list can authorize the app while it's in Dev Mode.

### 3. Run the E2E smoke test

1. Log in to `https://goviraleza.com`
2. Open `/meta` from the sidebar
3. Click **Connect Facebook**
4. Authorize the scopes on the OAuth consent screen
5. Confirm you land back on `/meta?connected=1`
6. Confirm the ad account dropdown populates
7. Select an ad account and confirm insights load (level=account, date=last_30d)

If step 3 fails with `redirect_uri_mismatch`: the Vercel deploy is stale. Re-check `git log origin/main -n1` matches `c606bdc` or later AND that Vercel has rebuilt.

If step 5 fails with `Meta OAuth not configured`: the `FB_APP_ID`/`FB_APP_SECRET` (or `META_APP_ID`/`META_APP_SECRET`) env vars aren't set on Vercel prod. Set them: the values are in `.env.local`.

---

## Remaining work (in priority order)

### 4. Add an Instagram / Page insights use case (for IG scopes)

Current Marketing API use case does NOT cover:
- `instagram_basic`
- `instagram_manage_insights`
- `pages_show_list`

Steps: `Use cases` → **Add use cases** → pick one matching those scopes (look for "Access engagement data on Pages and Instagram accounts" or similar). Customize it to include the missing scopes.

If you don't need IG insights yet, you can remove those scopes from `src/lib/meta/config.ts` `META_SCOPES` to narrow the OAuth request — Facebook will show a cleaner consent screen and App Review will ask fewer questions.

### 5. Remove unused use cases

`Use cases` → for each of "Create & manage app ads with Meta Ads Manager" and "Access the Threads API" → click Customize → look for a delete/remove option inside. If the UI doesn't let you remove, leaving them with zero customized permissions is fine — they don't affect the consent dialog.

### 6. App Review preparation (only needed to go Live)

Required before submitting:
- **Business Verification** — upload business registration doc (takes days)
- **Become a Tech Provider** — click the banner on the dashboard
- Per-scope written justification (describe WHERE + HOW each scope is used in the `/meta` page)
- Per-scope screencasts (30-90s each) showing the feature using the permission
- Data Handling Questionnaire:
  - Token: AES-256 encrypted at rest via `src/lib/encryption.ts`
  - HTTPS in transit
  - Retained until user disconnects; hard-deleted per `/data-deletion` policy

### 7. Submit App Review, then Go Live

After approval, `Publish` → flip to Live Mode.

---

## Key references

### Env vars needed in Vercel production

- `META_APP_ID=2118925715617016` (or `FB_APP_ID` — either works now)
- `META_APP_SECRET=<secret>` (or `FB_APP_SECRET` — either works now)
- `META_OAUTH_REDIRECT_URI` — **no longer needed** (derived from request origin)

### Codebase files

- `src/lib/meta/config.ts` — env reads + redirect URI builder
- `src/app/api/meta/oauth/{start,callback}/route.ts` — OAuth flow
- `src/app/api/meta/{account,insights}/route.ts` — authed API routes
- `src/components/meta-hub.tsx` — the /meta UI
- `src/app/data-deletion/page.tsx` — data deletion instructions
- `src/middleware.ts` — `/data-deletion`, `/privacy`, `/terms` are public

### Database (Neon)

- `meta_accounts` — one row per (user, Facebook account). Unique on user_id.
- `meta_insights_cache` — keyed by (user_id, ad_account_id, cache_key). 1h TTL.

### Facebook dev console direct links

- Dashboard: `/apps/2118925715617016/dashboard/`
- Basic settings: `/apps/2118925715617016/settings/basic/`
- Use cases: `/apps/2118925715617016/use_cases/`
- Facebook Login for Business settings: `/apps/2118925715617016/business-login/settings/`
- App roles (add testers): `/apps/2118925715617016/roles/roles/`
- Go live: `/apps/2118925715617016/go_live/`

---

## Common failure modes

- **`redirect_uri_mismatch`** — the URL the start route builds doesn't match any of the "Valid OAuth Redirect URIs" registered in Facebook Login for Business. With the new origin-derived code, this only happens if you're testing on an origin not registered with Facebook (e.g., a Vercel preview URL). To test previews, either register `*.vercel.app` subdomains in the FB console, or test only on the production domain.
- **"App not active"** — app is in Dev Mode and the user authorizing is not listed as Admin/Developer/Tester in App roles.
- **Scope missing from consent screen** — scope not "Ready for testing" in any customized use case, OR the scope requires App Review approval before it can be granted.
- **Meta rejects a URL during save** — the URL resolves to an auth-gated page. Check `src/middleware.ts` allowlist includes the path, redeploy, then retry.
