import {
  pgTable,
  primaryKey,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
  date,
  jsonb,
  uniqueIndex,
  index,
  boolean as pgBoolean,
} from 'drizzle-orm/pg-core';

// ── Users ──────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});

// ── Sessions ───────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

// ── Accounts ───────────────────────────────────────────────────────────────────

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 255 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: varchar('token_type', { length: 255 }),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

// ── Verification Tokens ────────────────────────────────────────────────────────

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (table) => [
    uniqueIndex('verification_tokens_identifier_token_idx').on(
      table.identifier,
      table.token
    ),
  ]
);

// ── Linked Accounts ────────────────────────────────────────────────────────────

export const linkedAccounts = pgTable(
  'linked_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    accessToken: text('access_token'),
    metadata: jsonb('metadata'),
    connectedAt: timestamp('connected_at', { mode: 'date' }).defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('linked_accounts_user_id_provider_idx').on(
      table.userId,
      table.provider
    ),
  ]
);

// ── Brands ─────────────────────────────────────────────────────────────────────

export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    primaryColor: varchar('primary_color', { length: 7 }).default('#14b8a6'),
    secondaryColor: varchar('secondary_color', { length: 7 }).default('#0d9488'),
    logoUrl: text('logo_url'),
    instagramHandle: varchar('instagram_handle', { length: 100 }),
    websiteUrl: varchar('website_url', { length: 255 }),
    description: text('description'),
    brandVoiceTone: varchar('brand_voice_tone', { length: 20 }).default('neutral'),
    brandVoiceStyle: varchar('brand_voice_style', { length: 20 }).default('balanced'),
    brandVoiceDos: text('brand_voice_dos'),
    brandVoiceDonts: text('brand_voice_donts'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('brands_user_id_slug_idx').on(table.userId, table.slug),
  ]
);

// ── Posts ───────────────────────────────────────────────────────────────────────

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  caption: text('caption').notNull(),
  hashtags: text('hashtags'),
  hookText: text('hook_text'),
  contentType: varchar('content_type', { length: 20 }),
  // Creative angle (question/stat/story/myth/…) chosen by the LRU rotation in
  // /api/captions. Persisted so the next generation can rotate EXACTLY off the
  // recent angles instead of re-inferring them from hook text. Null on legacy
  // rows — inference (classifyHookAngle) is the fallback. See creative-angles.ts.
  angle: varchar('angle', { length: 20 }),
  overlayStyle: varchar('overlay_style', { length: 20 }),
  textPosition: varchar('text_position', { length: 10 }),
  fontSize: integer('font_size').default(80),
  sourceImageUrl: text('source_image_url'),
  processedImageUrl: text('processed_image_url'),
  // 64-bit perceptual hash (dHash) of the source image, stored as 16-char
  // lowercase hex. Used by the visual no-reuse check — catches the case
  // where the same photo appears at different Pixabay URLs (different
  // upload IDs of identical or near-identical shots from the same shoot).
  // Null on legacy rows; lazily backfilled by generateFromSeed when seen.
  imageHash: text('image_hash'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  bufferPostId: text('buffer_post_id'),
  // Why a 'failed' post failed, in Buffer's own words (PostPublishingError:
  // message + rawError), captured by reconcileAutopilotStatuses. Without it a
  // dropped post showed a bare "Failed" and the cause — e.g. "Buffer has lost
  // authorization to post on your behalf" / "Invalid Credentials" — was invisible.
  failureReason: text('failure_reason'),
  source: varchar('source', { length: 32 }), // 'manual' (default null) | 'autopilot'
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});

// ── Post Analytics ─────────────────────────────────────────────────────────────

export const postAnalytics = pgTable('post_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  // One analytics row per post — unique so the daily attribution writer can
  // upsert (onConflictDoUpdate) fresh metrics as reach accrues over time.
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' })
    .unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  // DEAD COLUMN — never written. Meta deprecated `impressions` for media, so
  // it is not even requested; it reads 0 on every row. Kept only to avoid a
  // destructive migration. Use `views` instead.
  impressions: integer('impressions').default(0),
  // Meta's replacement for media impressions. Already fetched by
  // ig-analytics.ts (METRIC_KEYS includes 'views') but was never persisted —
  // so the one signal that actually varies above reach was being thrown away.
  // Verified live 2026-07-31: reach=10 views=24 on a real post.
  views: integer('views').default(0),
  // Real distribution/engagement signals for the angle-attribution loop —
  // matched back from Instagram media insights. See lib/brain/attribution.ts.
  reach: integer('reach').default(0),
  saves: integer('saves').default(0),
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).defaultNow(),
});

// ── Creative Generations (M2 — "creative as data") ────────────────────────────
//
// One row per GENERATION ATTEMPT, recording the INPUTS that produced a creative
// rather than only the artefact. The existing angle→reach loop learns from one
// attribute; this widens it to every knob we turn (hook shape, image source,
// overlay style, model, grade) so we can ask which of them actually correlate
// with reach.
//
// Deliberately a separate table, not columns on `posts`:
//   - a best-of-N loser or a quality-held draft never becomes a published post,
//     and what we REJECT is as informative as what we ship — postId is nullable.
//   - `posts` is on the hot path; this is written best-effort and read offline,
//     so keeping it separate means a failure here can never affect posting.
export const creativeGenerations = pgTable('creative_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  // Null when this attempt was discarded (best-of-N loser) or held for review.
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  // 'autopilot' | 'smart-posts' | 'batch' | 'ads'
  surface: varchar('surface', { length: 32 }).notNull(),
  model: varchar('model', { length: 64 }),
  angle: varchar('angle', { length: 20 }),
  // Structural shape of the hook (question / number / contrarian / …), derived
  // from the text so hooks can be compared across brands and wordings.
  hookPattern: varchar('hook_pattern', { length: 24 }),
  hookText: text('hook_text'),
  contentType: varchar('content_type', { length: 20 }),
  overlayStyle: varchar('overlay_style', { length: 20 }),
  // 'pixabay' | 'unsplash' | 'pexels' | 'generated' | …
  imageProvider: varchar('image_provider', { length: 24 }),
  // The search term or generation prompt that produced the image.
  imageQuery: text('image_query'),
  // 0–10 from runGrade; null when the grader was unavailable.
  gradeScore: integer('grade_score'),
  // Why this attempt did not ship, if it didn't ('quality_held', 'best_of_n_loser', …).
  discardedReason: varchar('discarded_reason', { length: 48 }),
  godModeFellBack: pgBoolean('god_mode_fell_back').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── User Preferences ───────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  defaultBrandId: uuid('default_brand_id').references(() => brands.id, {
    onDelete: 'set null',
  }),
  defaultOverlayStyle: varchar('default_overlay_style', { length: 20 }).default(
    'editorial'
  ),
  defaultTextPosition: varchar('default_text_position', { length: 10 }).default(
    'center'
  ),
  timezone: varchar('timezone', { length: 50 }).default('UTC'),
  onboardingCompleted: pgBoolean('onboarding_completed').notNull().default(false),
  onboardingStep: integer('onboarding_step').notNull().default(0),
  brandVoiceTone: varchar('brand_voice_tone', { length: 20 }).default('neutral'),
  brandVoiceStyle: varchar('brand_voice_style', { length: 20 }).default('balanced'),
  brandVoiceDos: text('brand_voice_dos'),
  brandVoiceDonts: text('brand_voice_donts'),
});

// ── Scraped Accounts ──────────────────────────────────────────────────────────

export const scrapedAccounts = pgTable(
  'scraped_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    handle: varchar('handle', { length: 100 }).notNull(),
    isCompetitor: pgBoolean('is_competitor').notNull().default(true),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
    followerCount: integer('follower_count'),
    followingCount: integer('following_count'),
    postCount: integer('post_count'),
    lastScrapedAt: timestamp('last_scraped_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('scraped_account_user_handle_idx').on(t.userId, t.handle)]
);

// ── Scraped Posts ─────────────────────────────────────────────────────────────

export const scrapedPosts = pgTable(
  'scraped_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => scrapedAccounts.id, { onDelete: 'cascade' }),
    shortcode: varchar('shortcode', { length: 50 }).notNull(),
    caption: text('caption'),
    likes: integer('likes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    imageUrl: text('image_url'),
    isVideo: pgBoolean('is_video').notNull().default(false),
    hashtags: text('hashtags'),
    postedAt: timestamp('posted_at', { mode: 'date' }),
    scrapedAt: timestamp('scraped_at', { mode: 'date' }).notNull().defaultNow(),
    mediaType: varchar('media_type', { length: 16 }), // REEL | CAROUSEL | IMAGE
    permalink: text('permalink'),
  },
  (t) => [uniqueIndex('scraped_post_user_shortcode_idx').on(t.userId, t.shortcode)]
);

// ── Health Score Snapshots ────────────────────────────────────────────────────
// Daily snapshots used for the weekly-delta badge on Smart Posts.
// brandId is nullable: null = "All brands" aggregate. Uniqueness is enforced
// at insert time (check-then-insert) rather than via a unique index, because
// Postgres treats NULL values as distinct and would allow duplicates per day.

export const healthScoreSnapshots = pgTable('health_score_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'cascade' }),
  dateKey: varchar('date_key', { length: 10 }).notNull(), // YYYY-MM-DD
  healthScore: integer('health_score').notNull(),
  recordedAt: timestamp('recorded_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Meta (Facebook/Instagram Marketing API) ───────────────────────────────────
// Stores the long-lived user access token per user (from OAuth), plus the list
// of ad accounts / pages / IG accounts the user has access to (fetched once on
// connect). The token is encrypted at rest via `encrypt()` from lib/encryption.

export const metaAccounts = pgTable(
  'meta_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The Facebook user ID of the person who authorized us (NOT our user.id).
    fbUserId: varchar('fb_user_id', { length: 64 }).notNull(),
    fbUserName: varchar('fb_user_name', { length: 255 }),
    // Encrypted long-lived user access token (~60 day lifetime).
    accessToken: text('access_token').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
    scopes: text('scopes'), // comma-separated list of granted scopes
    // Cached list of assets the user has access to. Structure:
    //   { adAccounts: [{id, name, currency, ...}], pages: [...], igAccounts: [...] }
    assets: jsonb('assets'),
    // Which asset the user has currently selected for the Insights dashboard.
    selectedAdAccountId: varchar('selected_ad_account_id', { length: 64 }),
    connectedAt: timestamp('connected_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meta_accounts_user_id_idx').on(t.userId)]
);

// ── Meta Ads ─────────────────────────────────────────────────────────────────
// Records every ad pushed to Meta, so the UI can show history and we never
// lose track of a created (paused) ad. Nullable Meta IDs allow a partial
// tree to be recorded when a step in the publish sequence fails.
export const metaAds = pgTable('meta_ads', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  brandId: uuid('brand_id')
    .notNull()
    .references(() => brands.id, { onDelete: 'cascade' }),
  adAccountId: varchar('ad_account_id', { length: 64 }).notNull(),
  pageId: varchar('page_id', { length: 64 }).notNull(),
  igAccountId: varchar('ig_account_id', { length: 64 }),
  campaignId: varchar('campaign_id', { length: 64 }),
  adsetId: varchar('adset_id', { length: 64 }),
  creativeId: varchar('creative_id', { length: 64 }),
  adId: varchar('ad_id', { length: 64 }),
  objective: varchar('objective', { length: 48 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PAUSED'),
  draft: jsonb('draft'),
  lastError: text('last_error'),
  // First-party click id embedded in the ad's destination URL as `gv_cid`.
  // This platform takes no payments — revenue happens in the marketed product
  // (pacebrain.app / affectly.app) — so a conversion reported back to us can
  // only be joined to the ad that caused it via this id. Null on ads published
  // before tagging existed, and on APP-objective ads whose App Store link
  // cannot carry query params.
  clickId: uuid('click_id'),
  // Provenance, so the ads agent can only ever pause or promote its OWN ads.
  // 'human' = built through /ads. 'agent' = created autonomously. NULL means
  // unknown (predates tagging) and is treated as human — hands off. See
  // lib/ads/agent-policy.ts, where this is the first check made.
  createdBy: varchar('created_by', { length: 16 }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Meta Ad Insights ─────────────────────────────────────────────────────────
// Daily performance snapshot per ad (one row per ad per UTC day) so the dashboard
// can show trends. Idempotent on (meta_ads_id, snapshot_date).
export const metaAdInsights = pgTable(
  'meta_ad_insights',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    metaAdsId: uuid('meta_ads_id')
      .notNull()
      .references(() => metaAds.id, { onDelete: 'cascade' }),
    adId: varchar('ad_id', { length: 64 }).notNull(),
    snapshotDate: date('snapshot_date', { mode: 'string' }).notNull(),
    currency: varchar('currency', { length: 3 }),
    spend: numeric('spend', { precision: 12, scale: 2 }).notNull().default('0'),
    impressions: integer('impressions').notNull().default(0),
    reach: integer('reach').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    inlineLinkClicks: integer('inline_link_clicks').notNull().default(0),
    ctr: numeric('ctr', { precision: 6, scale: 3 }).notNull().default('0'),
    cpc: numeric('cpc', { precision: 10, scale: 2 }).notNull().default('0'),
    frequency: numeric('frequency', { precision: 6, scale: 2 }).notNull().default('0'),
    results: integer('results').notNull().default(0),
    resultType: varchar('result_type', { length: 48 }),
    raw: jsonb('raw'),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meta_ad_insights_ad_day_idx').on(t.metaAdsId, t.snapshotDate)],
);

// ── Instagram (direct IG Login for Business) ──────────────────────────────────
// Separate from meta_accounts because Instagram Login for Business is a
// distinct auth path with its own endpoints (graph.instagram.com, not
// graph.facebook.com) and its own scope taxonomy (instagram_business_*).
//
// Unlike metaAccounts (one row per user — a single FB profile), a user can
// link multiple IG Business/Creator accounts, so we key on (userId, igUserId).

export const instagramAccounts = pgTable(
  'instagram_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // IG-scoped user ID returned by /me (distinct from any FB user ID).
    igUserId: varchar('ig_user_id', { length: 64 }).notNull(),
    igUsername: varchar('ig_username', { length: 255 }),
    // 'BUSINESS' or 'CREATOR' — the API rejects personal accounts outright,
    // but we record this so the UI can flag unusual cases.
    igAccountType: varchar('ig_account_type', { length: 32 }),
    name: varchar('name', { length: 255 }),
    profilePictureUrl: text('profile_picture_url'),
    // Encrypted long-lived IG user token (~60 day lifetime, refreshable).
    accessToken: text('access_token').notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { mode: 'date' }),
    scopes: text('scopes'), // comma-separated granted scopes
    connectedAt: timestamp('connected_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('instagram_accounts_user_ig_user_idx').on(t.userId, t.igUserId)]
);

// Cache for /insights responses — keyed by (userId, adAccountId, cacheKey)
// where cacheKey encodes the query shape (datePreset + level + breakdowns).
export const metaInsightsCache = pgTable(
  'meta_insights_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adAccountId: varchar('ad_account_id', { length: 64 }).notNull(),
    cacheKey: varchar('cache_key', { length: 255 }).notNull(),
    data: jsonb('data').notNull(),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  },
  (t) => [
    uniqueIndex('meta_insights_cache_unique_idx').on(
      t.userId,
      t.adAccountId,
      t.cacheKey
    ),
  ]
);

// ── Insights Cache ────────────────────────────────────────────────────────────

export const insightsCache = pgTable(
  'insights_cache',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    data: jsonb('data'),
    healthScore: integer('health_score'),
    computedAt: timestamp('computed_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('insights_cache_user_type_idx').on(t.userId, t.type)]
);

// ── Brain (daily insights pipeline) ───────────────────────────────────────────
// Three tables: snapshots (raw audit, 90d retention), signals (derived,
// queryable), brand_brain (one row per brand, narrative brief consumed by
// Smart Posts + Create). All keyed by brand_id so multi-brand users get
// fully independent brains.

export const brainSnapshots = pgTable(
  'brain_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    // 'ig' | 'ads' | 'competitor_account'
    source: varchar('source', { length: 32 }).notNull(),
    // Caller MUST truncate to start-of-day UTC before insert. The unique index
    // (brand_id, source, captured_at) enforces "one snapshot per brand+source+day"
    // only when callers respect this convention.
    capturedAt: timestamp('captured_at', { mode: 'date' }).notNull(),
    payload: jsonb('payload').notNull(),
    metricsSummary: jsonb('metrics_summary').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('brain_snapshots_brand_source_day_idx').on(
      t.brandId,
      t.source,
      t.capturedAt
    ),
    index('brain_snapshots_brand_captured_idx').on(t.brandId, t.capturedAt),
  ]
);

export const brainSignals = pgTable(
  'brain_signals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'cascade' }),
    computedAt: timestamp('computed_at', { mode: 'date' }).notNull().defaultNow(),
    windowDays: integer('window_days').notNull(), // 7 | 14 | 28
    topFormat: varchar('top_format', { length: 16 }), // REEL | CAROUSEL | IMAGE | null
    topSlotDow: integer('top_slot_dow'), // 0-6, Sunday=0
    topSlotHour: integer('top_slot_hour'), // 0-23 local
    hookPatterns: jsonb('hook_patterns'),
    ctaPatterns: jsonb('cta_patterns'),
    captionShape: jsonb('caption_shape'),
    topicClusters: jsonb('topic_clusters'),
    competitorSummary: jsonb('competitor_summary'),
    adSummary: jsonb('ad_summary'),
    rawKpis: jsonb('raw_kpis'),
  },
  (t) => [
    uniqueIndex('brain_signals_brand_window_idx').on(
      t.brandId,
      t.windowDays,
      t.computedAt
    ),
  ]
);

export const brandBrain = pgTable('brand_brain', {
  brandId: uuid('brand_id')
    .primaryKey()
    .references(() => brands.id, { onDelete: 'cascade' }),
  briefMd: text('brief_md').notNull(),
  briefVersion: integer('brief_version').notNull().default(0),
  signalsId: uuid('signals_id').references(() => brainSignals.id, {
    onDelete: 'set null',
  }),
  generatedAt: timestamp('generated_at', { mode: 'date' }).notNull().defaultNow(),
  lastRunAt: timestamp('last_run_at', { mode: 'date' }).notNull().defaultNow(),
  // 'ok' | 'partial' | 'failed' | 'skipped_no_connection'
  lastRunStatus: varchar('last_run_status', { length: 32 }).notNull().default('skipped_no_connection'),
  lastRunError: text('last_run_error'),
  ingestedSources: jsonb('ingested_sources').notNull(),
});

// ── Autopilot (subsystem #5) ──────────────────────────────────────────────────
// One row per brand. Controls whether autopilot is on, how often it runs, and
// whether it auto-publishes or saves drafts for the user to review.

export const autopilotSettings = pgTable('autopilot_settings', {
  brandId: uuid('brand_id')
    .primaryKey()
    .references(() => brands.id, { onDelete: 'cascade' }),
  enabled: pgBoolean('enabled').notNull().default(false),
  // 'daily' | 'every_other_day' | 'three_per_week' | 'weekly'
  frequency: varchar('frequency', { length: 32 }).notNull().default('every_other_day'),
  // 'queue' = save as draft for user review (default).
  // 'auto'  = schedule directly to Buffer at brain.formula.bestSlot.
  mode: varchar('mode', { length: 16 }).notNull().default('queue'),
  lastRunAt: timestamp('last_run_at', { mode: 'date' }),
  // Set after each run. Cron checks isDueNow(nextRunAt).
  nextRunAt: timestamp('next_run_at', { mode: 'date' }),
  lastError: text('last_error'),
  // Brief audit: how many posts autopilot has produced for this brand.
  totalGenerated: integer('total_generated').notNull().default(0),
  bufferChannelId: varchar('buffer_channel_id', { length: 128 }),
  bufferOrganizationId: varchar('buffer_organization_id', { length: 128 }),
  bufferChannelName: varchar('buffer_channel_name', { length: 255 }),
  // Opt-in media format (M3): 'image' (default, unchanged behaviour) | 'reel'.
  // Static feed images are the weakest distribution format on Instagram, so
  // this exists to let a brand test Reels without changing anything for brands
  // that don't opt in. See lib/autopilot/media-format.ts.
  mediaFormat: varchar('media_format', { length: 16 }).notNull().default('image'),
  // When we last alerted the user that this brand's Buffer channel had gone
  // disconnected. Set on the healthy→disconnected transition and cleared when the
  // channel comes back, so a multi-day outage sends ONE email, not one per run.
  channelAlertAt: timestamp('channel_alert_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Inferred Types ─────────────────────────────────────────────────────────────

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export type InsertBrand = typeof brands.$inferInsert;
export type SelectBrand = typeof brands.$inferSelect;

export type InsertPost = typeof posts.$inferInsert;
export type SelectPost = typeof posts.$inferSelect;

export type InsertLinkedAccount = typeof linkedAccounts.$inferInsert;
export type SelectLinkedAccount = typeof linkedAccounts.$inferSelect;

export type InsertScrapedAccount = typeof scrapedAccounts.$inferInsert;
export type SelectScrapedAccount = typeof scrapedAccounts.$inferSelect;
export type InsertScrapedPost = typeof scrapedPosts.$inferInsert;
export type SelectScrapedPost = typeof scrapedPosts.$inferSelect;

export type InsertMetaAccount = typeof metaAccounts.$inferInsert;
export type SelectMetaAccount = typeof metaAccounts.$inferSelect;
export type InsertMetaInsightsCache = typeof metaInsightsCache.$inferInsert;
export type SelectMetaInsightsCache = typeof metaInsightsCache.$inferSelect;

export type InsertInstagramAccount = typeof instagramAccounts.$inferInsert;
export type SelectInstagramAccount = typeof instagramAccounts.$inferSelect;

export type InsertBrainSnapshot = typeof brainSnapshots.$inferInsert;
export type SelectBrainSnapshot = typeof brainSnapshots.$inferSelect;
export type InsertBrainSignals = typeof brainSignals.$inferInsert;
export type SelectBrainSignals = typeof brainSignals.$inferSelect;
export type InsertBrandBrain = typeof brandBrain.$inferInsert;
export type SelectBrandBrain = typeof brandBrain.$inferSelect;

export type InsertAutopilotSettings = typeof autopilotSettings.$inferInsert;
export type SelectAutopilotSettings = typeof autopilotSettings.$inferSelect;
