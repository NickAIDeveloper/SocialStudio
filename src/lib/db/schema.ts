import {
  pgTable,
  primaryKey,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
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
  overlayStyle: varchar('overlay_style', { length: 20 }),
  textPosition: varchar('text_position', { length: 10 }),
  fontSize: integer('font_size').default(80),
  sourceImageUrl: text('source_image_url'),
  processedImageUrl: text('processed_image_url'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  scheduledAt: timestamp('scheduled_at', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  bufferPostId: text('buffer_post_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow(),
});

// ── Post Analytics ─────────────────────────────────────────────────────────────

export const postAnalytics = pgTable('post_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  likes: integer('likes').default(0),
  comments: integer('comments').default(0),
  shares: integer('shares').default(0),
  impressions: integer('impressions').default(0),
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).defaultNow(),
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
