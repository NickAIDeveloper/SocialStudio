# Social Studio — SaaS Conversion Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Convert single-user social media management tool into multi-tenant SaaS

---

## 1. Overview

Transform the existing Social Studio app from a single-user tool with hardcoded API keys into a multi-tenant SaaS where users sign up, link their own Instagram and Buffer accounts, manage their own brands, and have all data persisted per-user in a Neon Postgres database.

### Goals

- Users can register, log in, and manage their own dashboard
- Each user links their own Buffer API key and Instagram handles
- All generated posts, brands, analytics, and preferences persist per-user
- Existing setup migrates to a seed account (origae / origae2026)
- Core business logic (caption engine, image processing, competitor insights) remains unchanged

### Non-Goals (for now)

- Team workspaces / multi-user orgs
- OAuth login (Google, GitHub) — credentials only for v1
- Instagram Graph API integration (keep scraper for now)
- Billing / subscription management

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Auth | Auth.js v5 (credentials provider) |
| ORM | Drizzle ORM |
| Database | Neon Postgres (via `@neondatabase/serverless`) |
| Image Storage | Vercel Blob (already in deps) |
| Encryption | Node.js `crypto` (AES-256-GCM for API keys) |

### New Dependencies

```
@auth/core
@auth/drizzle-adapter
next-auth (v5)
drizzle-orm
drizzle-kit
@neondatabase/serverless
bcryptjs
@types/bcryptjs
```

---

## 3. Database Schema

### 3.1 `users`

Managed by Auth.js with custom fields.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| name | varchar(255) | Display name |
| email | varchar(255) | Unique, not null |
| password_hash | text | bcrypt hash, not null |
| email_verified | timestamp | Nullable, Auth.js field |
| image | text | Avatar URL, nullable |
| created_at | timestamp | Default now() |
| updated_at | timestamp | Default now() |

### 3.2 `sessions`

Auth.js managed.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_token | text | Unique, not null |
| user_id | uuid | FK → users.id, not null |
| expires | timestamp | Not null |

### 3.3 `linked_accounts`

Per-user external service credentials.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id, not null |
| provider | varchar(50) | 'buffer' or 'instagram', not null |
| access_token | text | AES-256-GCM encrypted, nullable |
| metadata | jsonb | Provider-specific data (org IDs, channel IDs, handle) |
| connected_at | timestamp | Default now() |
| updated_at | timestamp | Default now() |

Unique constraint: (user_id, provider)

### 3.4 `brands`

User-defined brands (replaces hardcoded affectly/pacebrain).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id, not null |
| name | varchar(100) | Not null |
| slug | varchar(100) | Lowercase, URL-safe, not null |
| primary_color | varchar(7) | Hex color, default '#14b8a6' |
| secondary_color | varchar(7) | Hex color, default '#0d9488' |
| logo_url | text | Vercel Blob URL, nullable |
| instagram_handle | varchar(100) | Nullable |
| created_at | timestamp | Default now() |

Unique constraint: (user_id, slug)

### 3.5 `posts`

Saved/generated content.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id, not null |
| brand_id | uuid | FK → brands.id, not null |
| caption | text | Not null |
| hashtags | text | Nullable |
| hook_text | text | Nullable |
| content_type | varchar(20) | quote, tip, carousel, community, promo |
| overlay_style | varchar(20) | editorial, bold-card, gradient-bar, full-tint |
| text_position | varchar(10) | top, center, bottom |
| font_size | integer | Default 80 |
| source_image_url | text | Original image URL |
| processed_image_url | text | Vercel Blob URL after processing |
| status | varchar(20) | draft, queued, scheduled, published |
| scheduled_at | timestamp | Nullable |
| published_at | timestamp | Nullable |
| buffer_post_id | text | Buffer's post ID after scheduling |
| created_at | timestamp | Default now() |
| updated_at | timestamp | Default now() |

### 3.6 `post_analytics`

Performance tracking per post.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| post_id | uuid | FK → posts.id, not null |
| user_id | uuid | FK → users.id, not null |
| likes | integer | Default 0 |
| comments | integer | Default 0 |
| shares | integer | Default 0 |
| impressions | integer | Default 0 |
| fetched_at | timestamp | Default now() |

### 3.7 `user_preferences`

User settings.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users.id, unique, not null |
| default_brand_id | uuid | FK → brands.id, nullable |
| default_overlay_style | varchar(20) | Default 'editorial' |
| default_text_position | varchar(10) | Default 'center' |
| timezone | varchar(50) | Default 'UTC' |

---

## 4. Authentication

### 4.1 Auth.js v5 Configuration

- **Provider:** Credentials (email + password)
- **Adapter:** Drizzle adapter for Neon
- **Session strategy:** JWT (stateless, no DB session lookups on every request)
- **Password hashing:** bcryptjs with salt rounds = 12

### 4.2 Middleware

File: `src/middleware.ts`

- Protects all routes except: `/login`, `/register`, `/api/auth/*`
- Redirects unauthenticated users to `/login`
- Adds `user_id` to request context for API routes

### 4.3 Pages

| Route | Purpose |
|-------|---------|
| `/login` | Email + password login form |
| `/register` | Signup form (name, email, password) |

Both are minimal, styled consistently with existing dark theme.

### 4.4 API Route Protection

Every API route calls `getServerSession()` and extracts `user_id`. Returns 401 if no session. All DB queries filter by `user_id`.

---

## 5. Linked Accounts

### 5.1 Buffer Connection

1. User navigates to `/settings`
2. Pastes their Buffer personal access token
3. App calls Buffer API to validate the token and fetch org/channel info
4. Token encrypted with AES-256-GCM and stored in `linked_accounts`
5. Org/channel metadata stored in `metadata` jsonb column

### 5.2 Instagram Connection

1. User enters their Instagram handle in `/settings`
2. Stored in `brands.instagram_handle`
3. Scraper uses this handle when fetching posts for that brand

### 5.3 Brand Logo Upload

1. User creates/edits a brand in the brand manager
2. Clicks "Upload Logo" — file picker accepts PNG/JPG/SVG (max 2MB)
3. Client sends file to `/api/brands/logo` endpoint
4. Server processes the logo:
   - Runs `removeWhiteBackground()` (existing function) to strip white bg
   - Resizes to 1000x1000 max (preserving aspect ratio)
   - Uploads processed PNG to Vercel Blob → returns public URL
5. URL stored in `brands.logo_url`
6. `compositeLogoOnImage()` updated to pull logo from `brands.logo_url` instead of hardcoded `public/logos/` files
7. Falls back to a generic watermark if no logo uploaded

### 5.3 Encryption

- Encryption key: `ENCRYPTION_KEY` env var (32-byte hex string)
- Algorithm: AES-256-GCM
- IV: random 16 bytes per encryption, stored with ciphertext
- Auth tag: 16 bytes, stored with ciphertext
- Format stored in DB: `iv:authTag:ciphertext` (all base64)

---

## 6. Changes to Existing Code

### 6.1 API Routes

| Route | Change |
|-------|--------|
| `/api/buffer` | Add auth check. Pull Buffer API key from `linked_accounts` instead of env var. Scope post data by `user_id`. |
| `/api/pixabay` | Add auth check. Pull Pixabay API key from `linked_accounts` instead of env var (per-user). |
| `/api/scrape` | Add auth check. Use brand's `instagram_handle` from DB. |
| `/api/logo` | Add auth check. No other changes (stateless image processing). |

New API route:

| Route | Purpose |
|-------|---------|
| `/api/brands/logo` | POST — accepts multipart logo upload, processes with sharp, stores in Vercel Blob, returns URL |

### 6.2 Libraries

| Library | Change |
|---------|--------|
| `buffer.ts` | Accept API key as parameter in all functions instead of reading `process.env.BUFFER_API_KEY`. |
| `image-processing.ts` | `compositeLogoOnImage()` accepts a `logoUrl` parameter (Vercel Blob URL) instead of reading from `public/logos/`. Downloads and caches the logo at runtime. Falls back to generic watermark if no logo. |
| `caption-engine.ts` | No change (stateless). |
| `content-intelligence.ts` | No change (uses static competitor data). |
| `instagram-scraper.ts` | Accept handle as parameter instead of hardcoding. |
| `github-images.ts` | Accept token as parameter or keep shared (image CDN is shared). |

### 6.3 Components

| Component | Change |
|-----------|--------|
| `sidebar.tsx` | Add user avatar, name, logout button, settings link. |
| `post-generator.tsx` | Load user's brands from DB. Save posts to DB. Load Buffer channels from user's linked account. |
| `batch-gallery.tsx` | Same as post-generator — user-scoped brands and persistence. |
| `buffer-scheduler.tsx` | Pull channels from user's linked Buffer account. |
| `analytics-dashboard.tsx` | Load analytics from DB per user. |
| `command-center.tsx` | Show user-specific stats from DB. |
| `competitor-dashboard.tsx` | Minimal changes — competitor data is shared static data. |

### 6.4 New Components

| Component | Purpose |
|-----------|---------|
| `login-form.tsx` | Email + password login |
| `register-form.tsx` | Signup form |
| `settings-panel.tsx` | Connect Buffer, manage brands, preferences |
| `brand-manager.tsx` | Add/edit/delete brands with logo upload |

### 6.5 New Pages

| Route | Component |
|-------|-----------|
| `/login` | LoginForm |
| `/register` | RegisterForm |
| `/settings` | SettingsPanel + BrandManager |

---

## 7. Seed Data

On first migration, create the origae account with pre-populated data:

```
User:
  email: origae@socialstudio.app
  password: origae2026 (bcrypt hashed)
  name: Origae

Brands:
  - affectly (teal colors, existing logo)
  - pacebrain (blue colors, existing logo)

Linked Accounts:
  - buffer: existing BUFFER_API_KEY from env (encrypted)

Preferences:
  - default_brand: affectly
  - default_overlay_style: editorial
  - timezone: UTC
```

---

## 8. New File Structure

```
src/
├── auth.ts                          # Auth.js v5 config
├── middleware.ts                     # Route protection
├── lib/
│   ├── db/
│   │   ├── index.ts                 # Drizzle client + Neon connection
│   │   ├── schema.ts                # All table definitions
│   │   └── migrate.ts               # Migration runner
│   ├── encryption.ts                # AES-256-GCM encrypt/decrypt
│   └── auth-helpers.ts              # getRequiredSession(), getUserId()
├── app/
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts         # Auth.js API route
│       └── brands/
│           └── logo/
│               └── route.ts         # Logo upload + processing
├── components/
│   ├── login-form.tsx
│   ├── register-form.tsx
│   ├── settings-panel.tsx
│   └── brand-manager.tsx
drizzle/
├── migrations/                      # Generated SQL migrations
drizzle.config.ts                    # Drizzle Kit config
```

---

## 9. Environment Variables

### New Required

| Variable | Purpose |
|----------|---------|
| `NEON_DB_URL` | Neon Postgres connection string (already added) |
| `NEXTAUTH_SECRET` | Auth.js session signing key (random 32+ chars) |
| `NEXTAUTH_URL` | App URL, e.g. `http://localhost:3000` |
| `ENCRYPTION_KEY` | 32-byte hex for AES-256-GCM API key encryption |

### Existing (kept for seed/fallback)

| Variable | Purpose |
|----------|---------|
| `PIXABAY_API_KEY` | Seed data for origae account (per-user after migration) |
| `BUFFER_API_KEY` | Seed data for origae account |
| `GITHUB_TOKEN` | Shared image CDN |

---

## 10. Implementation Phases

### Phase 1 — Foundation
- Install dependencies (Auth.js, Drizzle, Neon driver, bcryptjs)
- Set up Drizzle schema + Neon connection
- Run initial migration
- Configure Auth.js v5 with credentials provider
- Add middleware for route protection
- Create login + register pages
- Seed origae account

### Phase 2 — Settings & Linked Accounts
- Create settings page
- Build Buffer connection flow (paste key → validate → encrypt → store)
- Build brand manager (add/edit brands with logo upload)
- Add encryption utility

### Phase 3 — Migrate Existing Features
- Refactor `buffer.ts` to accept per-user API key
- Update all API routes with auth checks + user scoping
- Update post-generator to save/load posts from DB
- Update batch-gallery to persist to DB
- Update sidebar with user info + logout

### Phase 4 — Analytics & History
- Persist scheduled post history to DB
- Build post analytics fetching and storage
- Update analytics dashboard to read from DB
- Update command center with user-specific stats
