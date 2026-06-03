CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "autopilot_settings" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"frequency" varchar(32) DEFAULT 'every_other_day' NOT NULL,
	"mode" varchar(16) DEFAULT 'queue' NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"last_error" text,
	"total_generated" integer DEFAULT 0 NOT NULL,
	"buffer_channel_id" varchar(128),
	"buffer_organization_id" varchar(128),
	"buffer_channel_name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brain_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"window_days" integer NOT NULL,
	"top_format" varchar(16),
	"top_slot_dow" integer,
	"top_slot_hour" integer,
	"hook_patterns" jsonb,
	"cta_patterns" jsonb,
	"caption_shape" jsonb,
	"topic_clusters" jsonb,
	"competitor_summary" jsonb,
	"ad_summary" jsonb,
	"raw_kpis" jsonb
);
--> statement-breakpoint
CREATE TABLE "brain_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" varchar(32) NOT NULL,
	"captured_at" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	"metrics_summary" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_brain" (
	"brand_id" uuid PRIMARY KEY NOT NULL,
	"brief_md" text NOT NULL,
	"brief_version" integer DEFAULT 0 NOT NULL,
	"signals_id" uuid,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"last_run_at" timestamp DEFAULT now() NOT NULL,
	"last_run_status" varchar(32) DEFAULT 'skipped_no_connection' NOT NULL,
	"last_run_error" text,
	"ingested_sources" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"primary_color" varchar(7) DEFAULT '#14b8a6',
	"secondary_color" varchar(7) DEFAULT '#0d9488',
	"logo_url" text,
	"instagram_handle" varchar(100),
	"website_url" varchar(255),
	"description" text,
	"brand_voice_tone" varchar(20) DEFAULT 'neutral',
	"brand_voice_style" varchar(20) DEFAULT 'balanced',
	"brand_voice_dos" text,
	"brand_voice_donts" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "health_score_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_id" uuid,
	"date_key" varchar(10) NOT NULL,
	"health_score" integer NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"data" jsonb,
	"health_score" integer,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ig_user_id" varchar(64) NOT NULL,
	"ig_username" varchar(255),
	"ig_account_type" varchar(32),
	"name" varchar(255),
	"profile_picture_url" text,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp,
	"scopes" text,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"access_token" text,
	"metadata" jsonb,
	"connected_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meta_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fb_user_id" varchar(64) NOT NULL,
	"fb_user_name" varchar(255),
	"access_token" text NOT NULL,
	"token_expires_at" timestamp,
	"scopes" text,
	"assets" jsonb,
	"selected_ad_account_id" varchar(64),
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meta_ads_id" uuid NOT NULL,
	"ad_id" varchar(64) NOT NULL,
	"snapshot_date" date NOT NULL,
	"currency" varchar(3),
	"spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"inline_link_clicks" integer DEFAULT 0 NOT NULL,
	"ctr" numeric(6, 3) DEFAULT '0' NOT NULL,
	"cpc" numeric(10, 2) DEFAULT '0' NOT NULL,
	"frequency" numeric(6, 2) DEFAULT '0' NOT NULL,
	"results" integer DEFAULT 0 NOT NULL,
	"result_type" varchar(48),
	"raw" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"ad_account_id" varchar(64) NOT NULL,
	"page_id" varchar(64) NOT NULL,
	"ig_account_id" varchar(64),
	"campaign_id" varchar(64),
	"adset_id" varchar(64),
	"creative_id" varchar(64),
	"ad_id" varchar(64),
	"objective" varchar(48) NOT NULL,
	"status" varchar(24) DEFAULT 'PAUSED' NOT NULL,
	"draft" jsonb,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_insights_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ad_account_id" varchar(64) NOT NULL,
	"cache_key" varchar(255) NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"impressions" integer DEFAULT 0,
	"fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"caption" text NOT NULL,
	"hashtags" text,
	"hook_text" text,
	"content_type" varchar(20),
	"overlay_style" varchar(20),
	"text_position" varchar(10),
	"font_size" integer DEFAULT 80,
	"source_image_url" text,
	"processed_image_url" text,
	"image_hash" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"buffer_post_id" text,
	"source" varchar(32),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scraped_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" varchar(100) NOT NULL,
	"is_competitor" boolean DEFAULT true NOT NULL,
	"brand_id" uuid,
	"follower_count" integer,
	"following_count" integer,
	"post_count" integer,
	"last_scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraped_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"shortcode" varchar(50) NOT NULL,
	"caption" text,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"is_video" boolean DEFAULT false NOT NULL,
	"hashtags" text,
	"posted_at" timestamp,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"media_type" varchar(16),
	"permalink" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"default_brand_id" uuid,
	"default_overlay_style" varchar(20) DEFAULT 'editorial',
	"default_text_position" varchar(10) DEFAULT 'center',
	"timezone" varchar(50) DEFAULT 'UTC',
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_step" integer DEFAULT 0 NOT NULL,
	"brand_voice_tone" varchar(20) DEFAULT 'neutral',
	"brand_voice_style" varchar(20) DEFAULT 'balanced',
	"brand_voice_dos" text,
	"brand_voice_donts" text,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_settings" ADD CONSTRAINT "autopilot_settings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_signals" ADD CONSTRAINT "brain_signals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_snapshots" ADD CONSTRAINT "brain_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_brain" ADD CONSTRAINT "brand_brain_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_brain" ADD CONSTRAINT "brand_brain_signals_id_brain_signals_id_fk" FOREIGN KEY ("signals_id") REFERENCES "public"."brain_signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_score_snapshots" ADD CONSTRAINT "health_score_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_score_snapshots" ADD CONSTRAINT "health_score_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights_cache" ADD CONSTRAINT "insights_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_accounts" ADD CONSTRAINT "meta_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_insights" ADD CONSTRAINT "meta_ad_insights_meta_ads_id_meta_ads_id_fk" FOREIGN KEY ("meta_ads_id") REFERENCES "public"."meta_ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insights_cache" ADD CONSTRAINT "meta_insights_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_analytics" ADD CONSTRAINT "post_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_accounts" ADD CONSTRAINT "scraped_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_accounts" ADD CONSTRAINT "scraped_accounts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_posts" ADD CONSTRAINT "scraped_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scraped_posts" ADD CONSTRAINT "scraped_posts_account_id_scraped_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."scraped_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_brand_id_brands_id_fk" FOREIGN KEY ("default_brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brain_signals_brand_window_idx" ON "brain_signals" USING btree ("brand_id","window_days","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_snapshots_brand_source_day_idx" ON "brain_snapshots" USING btree ("brand_id","source","captured_at");--> statement-breakpoint
CREATE INDEX "brain_snapshots_brand_captured_idx" ON "brain_snapshots" USING btree ("brand_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_user_id_slug_idx" ON "brands" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "insights_cache_user_type_idx" ON "insights_cache" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_accounts_user_ig_user_idx" ON "instagram_accounts" USING btree ("user_id","ig_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_user_id_provider_idx" ON "linked_accounts" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_accounts_user_id_idx" ON "meta_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_ad_insights_ad_day_idx" ON "meta_ad_insights" USING btree ("meta_ads_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_insights_cache_unique_idx" ON "meta_insights_cache" USING btree ("user_id","ad_account_id","cache_key");--> statement-breakpoint
CREATE UNIQUE INDEX "scraped_account_user_handle_idx" ON "scraped_accounts" USING btree ("user_id","handle");--> statement-breakpoint
CREATE UNIQUE INDEX "scraped_post_user_shortcode_idx" ON "scraped_posts" USING btree ("user_id","shortcode");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_identifier_token_idx" ON "verification_tokens" USING btree ("identifier","token");