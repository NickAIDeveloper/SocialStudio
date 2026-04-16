# Meta (Facebook) Integration Setup

## One-time setup on developers.facebook.com

1. Go to https://developers.facebook.com/apps and click **Create App**
2. Use case: **Other** → App type: **Business**
3. Once created, note the **App ID** and **App Secret** from `Settings → Basic`
4. Fill in:
   - **Privacy Policy URL** → `https://yourdomain.com/privacy`
   - **Terms of Service URL** → `https://yourdomain.com/terms`
   - **Category** → Business and Pages (or similar)
5. Under `Products`, add:
   - **Facebook Login for Business** (implements the OAuth dialog)
   - **Marketing API**
6. In **Facebook Login → Settings**, add your redirect URI to
   **Valid OAuth Redirect URIs**:
   - Development: `http://localhost:3000/api/meta/oauth/callback`
   - Production: `https://yourdomain.com/api/meta/oauth/callback`
7. In **App Review → Permissions and Features**, note you're in **Development Mode** — you can test with your own Facebook account without review. For external users, submit for App Review with scopes: `ads_read`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`, `business_management`.

## Environment variables

Add to your Vercel project env (or `.env.local` for dev):

```
META_APP_ID=123456789012345
META_APP_SECRET=abc...                               # from Settings → Basic
META_OAUTH_REDIRECT_URI=http://localhost:3000/api/meta/oauth/callback
META_API_VERSION=v21.0                                # optional, defaults to v21.0
ENCRYPTION_KEY=...                                    # already required by app; 64-char hex
```

**The redirect URI must match exactly** what you registered in step 6.

## Database migration

Two new tables were added to `src/lib/db/schema.ts`: `meta_accounts` and
`meta_insights_cache`. Run your normal drizzle migration step
(`npx drizzle-kit push` or your project's equivalent).

## Testing the flow

1. Visit `/meta` while logged in
2. Click **Connect Facebook** — you'll be redirected to Facebook's consent screen
3. Approve → Facebook redirects to `/api/meta/oauth/callback?code=...&state=...`
4. Callback exchanges code → short token → long-lived token, stores encrypted
5. You're bounced back to `/meta?connected=1` with your ad accounts listed

## Standard Access vs Advanced Access — the review bottleneck

In **Standard Access** (auto-granted on new apps) you can only read insights
for ad accounts *you own or admin*. To serve external users you need
**Advanced Access**, which requires:

- App Review approval for each requested scope
- Business Verification completed
- **1,500+ successful Marketing API calls in the last 15 days** with
  <15% error rate — the practical way to hit this is to ship the feature
  for yourself first, use it, then submit

## Token lifecycle

Long-lived user tokens expire in ~60 days. There is no refresh token. The
`/meta` page displays the days-until-expiry and prompts the user to reconnect.
