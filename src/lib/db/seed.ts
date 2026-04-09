/**
 * Seed script: populates the origae account with brands and linked accounts.
 *
 * Usage:  npm run db:seed
 *         npx tsx src/lib/db/seed.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import * as schema from './schema';
import { encrypt } from '../encryption';

// ── Validate required env vars ────────────────────────────────────────────────

const required = ['NEON_DB_URL', 'ENCRYPTION_KEY', 'BUFFER_API_KEY', 'PIXABAY_API_KEY'] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const sql = neon(process.env.NEON_DB_URL!);
const db = drizzle({ client: sql, schema });

// ── Seed data ─────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Starting seed...\n');

  // 1. Validate seed credentials from env
  const seedEmail = process.env.SEED_USER_EMAIL || 'origae@socialstudio.app';
  const seedPassword = process.env.SEED_USER_PASSWORD;
  if (!seedPassword) {
    throw new Error('SEED_USER_PASSWORD env var is required for seeding');
  }

  // 2. Check if user already exists
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, seedEmail));

  if (existing.length > 0) {
    console.log(`User ${seedEmail} already exists — skipping seed.`);
    return;
  }

  // 3. Create user
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: seedEmail,
      passwordHash,
      name: 'Origae',
    })
    .returning();

  console.log(`Created user: ${user.email} (${user.id})`);

  // 4. Create brands
  const [affectly] = await db
    .insert(schema.brands)
    .values({
      userId: user.id,
      name: 'Affectly',
      slug: 'affectly',
      primaryColor: '#14b8a6',
      secondaryColor: '#0d9488',
      instagramHandle: 'affectly.app',
    })
    .returning();

  console.log(`Created brand: ${affectly.name} (${affectly.id})`);

  const [pacebrain] = await db
    .insert(schema.brands)
    .values({
      userId: user.id,
      name: 'PaceBrain',
      slug: 'pacebrain',
      primaryColor: '#3b82f6',
      secondaryColor: '#2563eb',
      instagramHandle: 'pacebrain.app',
    })
    .returning();

  console.log(`Created brand: ${pacebrain.name} (${pacebrain.id})`);

  // 5. Create linked accounts (encrypted tokens)
  const encryptedBufferKey = encrypt(process.env.BUFFER_API_KEY!);
  const encryptedPixabayKey = encrypt(process.env.PIXABAY_API_KEY!);

  const [bufferAccount] = await db
    .insert(schema.linkedAccounts)
    .values({
      userId: user.id,
      provider: 'buffer',
      accessToken: encryptedBufferKey,
    })
    .returning();

  console.log(`Created linked account: ${bufferAccount.provider} (${bufferAccount.id})`);

  const [pixabayAccount] = await db
    .insert(schema.linkedAccounts)
    .values({
      userId: user.id,
      provider: 'pixabay',
      accessToken: encryptedPixabayKey,
    })
    .returning();

  console.log(`Created linked account: ${pixabayAccount.provider} (${pixabayAccount.id})`);

  // 6. Create user preferences (onboarding already done for seed user)
  const [prefs] = await db
    .insert(schema.userPreferences)
    .values({
      userId: user.id,
      defaultBrandId: affectly.id,
      defaultOverlayStyle: 'editorial',
      defaultTextPosition: 'center',
      timezone: 'UTC',
      onboardingCompleted: true,
      onboardingStep: 5,
    })
    .returning();

  console.log(`Created user preferences (${prefs.id})`);

  console.log('\nSeed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
