# Meta App Publishing — Resume Plan

Target: get the GoViraleza Meta app published + through App Review so real
users can authorize Facebook at `/meta` and read ads insights.

- **App:** GoViraleza (App ID `2118925715617016`)
- **Deployed domain:** `https://goviraleza.com` (redirects to `www.`)
- **Dev console:** https://developers.facebook.com/apps/2118925715617016/
- **Current status:** Unpublished

---

## How to resume

A Playwright browser session was already logged in as the app owner last session. That session may or may not still be alive — if not, ask the user to re-log in with this sequence:

1. Navigate to `https://developers.facebook.com/apps/2118925715617016/`
2. User logs in themselves (don't type credentials)
3. User says "I'm in"

All the field refs in this doc are stale once the page reloads — always call `browser_snapshot` first to get fresh refs before clicking.

---

## Done — do not redo

- [x] Meta integration code complete (schema, OAuth routes, client, hub UI)
- [x] Pushed to `origin/develop` (commits `c8779cc`, `48c0a22`, `3937eb4`)
- [x] Neon DB tables verified: `meta_accounts`, `meta_insights_cache` (with unique indexes)
- [x] Created `src/app/data-deletion/page.tsx`
- [x] Fixed `src/middleware.ts` to allow public access to `/data-deletion`
- [x] Audited Meta Basic Settings — pre-filled fields: name (GoViraleza), app icon, contact email (origae.dev@gmail.com), category (Utility & productivity), DPO info
- [x] Typed (NOT SAVED) into empty Basic Settings fields:
  - App Domains: `goviraleza.com`
  - Privacy policy URL: `https://goviraleza.com/privacy`
  - Terms of Service URL: `https://goviraleza.com/terms`
  - User data deletion URL: `https://goviraleza.com/data-deletion`
- [x] Save failed — Meta rejected because `/data-deletion` was redirecting to `/login` (middleware block). Fix committed but needs user to deploy to prod.

---

## Immediate next step (start here)

### 1. Verify `/data-deletion` is publicly accessible

```bash
curl -sL -o /dev/null -w "%{http_code} %{url_effective}\n" https://goviraleza.com/data-deletion
```

Expected: `200 https://www.goviraleza.com/data-deletion`

If it still redirects to `/login`, the middleware fix hasn't deployed yet — stop and ask the user to deploy `develop` → production on Vercel.

### 2. Save Meta Basic Settings

1. `browser_navigate` to `https://developers.facebook.com/apps/2118925715617016/settings/basic/`
2. `browser_snapshot` — check the 4 fields (App Domains, Privacy, Terms, Data Deletion URL). They may still be typed from last session, OR may have reset.
3. If reset, re-fill:
   - App Domains: `goviraleza.com` (tag combobox — type + Enter)
   - Privacy policy URL: `https://goviraleza.com/privacy`
   - Terms of Service URL: `https://goviraleza.com/terms`
   - User data deletion URL: `https://goviraleza.com/data-deletion`
4. Click **Save changes**.
5. Confirm green success banner appears. If red error, screenshot + diagnose.

---

## Remaining work

### 3. Facebook Login for Business — add OAuth redirect URI

Left nav → **Facebook Login for Business** → **Settings**.

- Add valid OAuth redirect URI: `https://goviraleza.com/api/meta/oauth/callback`
- Ensure **Client OAuth Login** and **Web OAuth Login** are enabled
- Leave **Enforce HTTPS** on
- Save

**Precondition:** confirm user has updated Vercel env var
`META_OAUTH_REDIRECT_URI=https://goviraleza.com/api/meta/oauth/callback`
on production env. If still `http://localhost:3000/...`, the code will generate a mismatched redirect and Facebook will reject the OAuth request.

### 4. Clean up use cases

Left nav → **Use cases**.

- **Remove:** "Access the Threads API" — not used by our app
- **Remove:** "Create & manage app ads with Meta Ads Manager" — we don't manage app install ads
- **Customize:** "Create & manage ads with Marketing API" — this is the one we need. Permissions it should grant: `ads_read`, `ads_management` (for future), `business_management`.
- **Add:** an Instagram/Page insights use case covering `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`. Name will be similar to "Access engagement data on Pages and Instagram accounts." The exact use case name changes per Meta's UI — scan the "Add use cases" catalog and pick the one matching those scopes.

If a single use case doesn't cover all four Insta/Page scopes, add two.

### 5. Test end-to-end (before App Review)

With the app in Dev Mode, only users added under **App roles > Roles** (Admin/Developer/Tester) can actually authorize. Add the user's Facebook account as a tester if not already.

Test flow:

1. Visit `https://goviraleza.com/meta`
2. Click **Connect Facebook**
3. Authorize all requested scopes
4. Confirm redirect lands back on `/meta?connected=1`
5. Verify ad accounts dropdown populates
6. Verify insights load with at least `level=account`, `datePreset=last_30d`, `breakdown=none`
7. Try `level=campaign` and `breakdown=age` — confirm table renders

If any step fails, debug before proceeding to App Review.

### 6. Prepare App Review materials

Meta requires these before submit. Each permission needs separate justification + screencast.

- **Business Verification** — upload a business registration doc. Can take days for Meta to review. Start early.
- **"Become a Tech Provider"** banner on the app dashboard — click through the flow. Required before submitting.
- **Per-scope written justification** — for each of `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`: describe exactly *how* and *where* in the app the scope is used. Reference the `/meta` page.
- **Per-scope screencast** — film a real user flow showing each permission in action. 30-90 seconds each. Show the OAuth consent screen requesting the scope, then the feature that uses it working.
- **Data Handling Questionnaire** — fill in Meta's form about retention, encryption at rest, encryption in transit. Answer truthfully:
  - Token: AES-256 encrypted at rest via `lib/encryption.ts`
  - HTTPS in transit
  - Retained until user disconnects; then hard-deleted (documented on `/data-deletion`)

### 7. Submit App Review

Only after 1-6 are green. Expect 3-7 day review turnaround. Rejections are verbose and fixable — don't worry if the first submission gets rejected for a missing detail.

### 8. Go Live

After App Review approves the scopes, flip the app to Live Mode (**Publish** in left nav).

---

## Key references

### Env vars needed in Vercel production

- `FB_APP_ID=2118925715617016`
- `FB_APP_SECRET=<secret from Meta dashboard>` (read from `.env.local` — it's already there)
- `META_OAUTH_REDIRECT_URI=https://goviraleza.com/api/meta/oauth/callback`
- `META_APP_ID=2118925715617016` (legacy — same as FB_APP_ID)

### Codebase files (in priority order)

- `src/middleware.ts` — controls what's public; already has `data-deletion` now
- `src/lib/meta/client.ts` — Graph API wrapper
- `src/lib/meta/config.ts` — scopes list
- `src/app/api/meta/oauth/{start,callback}/route.ts` — OAuth flow
- `src/app/api/meta/{account,insights}/route.ts` — authed API routes
- `src/components/meta-hub.tsx` — the /meta UI
- `src/app/data-deletion/page.tsx` — data deletion instructions
- `docs/META-SETUP.md` — original dev setup doc

### Database (Neon)

- `meta_accounts` — one row per (user, Facebook account). Unique on user_id.
- `meta_insights_cache` — keyed by (user_id, ad_account_id, cache_key). 1h TTL.

### Facebook dev console direct links

- Dashboard: `/apps/2118925715617016/dashboard/`
- Basic settings: `/apps/2118925715617016/settings/basic/`
- Use cases: `/apps/2118925715617016/use_cases/`
- Facebook Login settings: `/apps/2118925715617016/fb-login/settings/`
- App roles (add testers): `/apps/2118925715617016/roles/roles/`
- Go live: `/apps/2118925715617016/go_live/`

---

## Common failure modes

- **Meta rejects URL with "should represent a valid URL"** — the URL resolves to an auth-gated page. Check middleware allowlist includes the path. Deploy. Retry.
- **OAuth redirect_uri_mismatch** — Valid OAuth Redirect URIs in Facebook Login > Settings does not exactly match the URL the code constructs. Must match character-for-character including protocol + trailing slash.
- **"App not active"** — app is in Dev Mode and authorizer is not listed as Admin/Developer/Tester in App roles.
- **Scope missing from consent screen** — scope not attached to any use case, OR use case not customized to include it, OR scope requires App Review approval first.
- **Threads fields still in Basic Settings** — removing the Threads use case does NOT remove the Threads app ID/secret. That's fine for our purposes; leave them.

---

## Task list mapping (in Claude tasks)

Open tasks at handoff (use TaskList to see current state):

- #6 Fill App Settings > Basic (blocked on deploy)
- #7 Configure Facebook Login product
- #8 Add / customize use cases (remove Threads + Ads Manager, customize Marketing API, add IG/Page insights)
- #10 Audit App Review requirements
- #12 Fix META_OAUTH_REDIRECT_URI (moved to user — Vercel env)
- #13 Deploy /data-deletion, then save Basic Settings

Once #6 is saved, mark #13 complete.
