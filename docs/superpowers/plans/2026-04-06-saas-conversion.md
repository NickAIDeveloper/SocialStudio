# Social Studio SaaS Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-user Social Studio app into a multi-tenant SaaS with auth, per-user data, linked accounts, and brand management.

**Architecture:** Auth.js v5 with credentials provider stores users in Neon Postgres via Drizzle ORM. Every API route and page is protected by middleware. Each user has their own brands, linked Buffer/Instagram accounts, saved posts, and preferences — all scoped by `user_id` in every query.

**Tech Stack:** Next.js 16 (App Router), Auth.js v5, Drizzle ORM, Neon Postgres (`@neondatabase/serverless`), Vercel Blob, bcryptjs, AES-256-GCM encryption.

**Spec:** `docs/superpowers/specs/2026-04-06-saas-conversion-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `drizzle.config.ts` | Drizzle Kit config for migrations |
| `src/lib/db/index.ts` | Drizzle client + Neon connection |
| `src/lib/db/schema.ts` | All table definitions (users, sessions, linked_accounts, brands, posts, post_analytics, user_preferences) |
| `src/lib/db/seed.ts` | Seed script for origae account |
| `src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt for API keys |
| `src/lib/auth-helpers.ts` | `getRequiredSession()`, `getUserId()` helpers |
| `src/auth.ts` | Auth.js v5 config with credentials provider + Drizzle adapter |
| `src/middleware.ts` | Route protection middleware |
| `src/app/login/page.tsx` | Login page |
| `src/app/register/page.tsx` | Register page |
| `src/app/settings/page.tsx` | Settings page |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js API route handler |
| `src/app/api/brands/route.ts` | CRUD API for brands |
| `src/app/api/brands/logo/route.ts` | Logo upload + processing |
| `src/app/api/linked-accounts/route.ts` | Connect/disconnect external services |
| `src/app/api/posts/route.ts` | CRUD API for saved posts |
| `src/components/login-form.tsx` | Login form component |
| `src/components/register-form.tsx` | Register form component |
| `src/components/settings-panel.tsx` | Settings panel (Buffer connection, preferences) |
| `src/components/brand-manager.tsx` | Brand CRUD with logo upload |
| `src/components/session-provider.tsx` | Client-side session context wrapper |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add new dependencies |
| `.env.local` | Add NEXTAUTH_SECRET, NEXTAUTH_URL, ENCRYPTION_KEY |
| `src/app/layout.tsx` | Wrap in SessionProvider, conditionally show sidebar |
| `src/components/sidebar.tsx` | Add user info, logout, settings link |
| `src/lib/buffer.ts` | Accept API key as parameter instead of env var |
| `src/lib/image-processing.ts` | `compositeLogoOnImage()` accepts `logoUrl` param |
| `src/app/api/buffer/route.ts` | Add auth, pull per-user Buffer key |
| `src/app/api/pixabay/route.ts` | Add auth check |
| `src/app/api/scrape/route.ts` | Add auth, use brand's instagram_handle |
| `src/app/api/logo/route.ts` | Add auth check |
| `src/components/post-generator.tsx` | Load brands from DB, save posts to DB |
| `src/components/batch-gallery.tsx` | Same — user-scoped brands and persistence |
| `src/components/command-center.tsx` | User-specific stats from DB |
| `src/components/analytics-dashboard.tsx` | Load analytics from DB per user |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Modify: `.env.local`

- [ ] **Step 1: Install npm packages**

```bash
npm install next-auth@beta @auth/drizzle-adapter drizzle-orm @neondatabase/serverless bcryptjs
npm install -D drizzle-kit @types/bcryptjs
```

- [ ] **Step 2: Generate secrets and add to .env.local**

```bash
node -e "console.log('NEXTAUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local
echo "NEXTAUTH_URL=http://localhost:3000" >> .env.local
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> .env.local
```

- [ ] **Step 3: Verify installation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.local
git commit -m "chore: install auth, drizzle, neon dependencies for SaaS conversion"
```

---

## Task 2: Database Schema + Drizzle Config

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/lib/db/index.ts`
- Create: `src/lib/db/schema.ts`

- [ ] **Step 1: Create Drizzle config**

Create `drizzle.config.ts`:

```typescript
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEON_DB_URL!,
  },
});
```

- [ ] **Step 2: Create Drizzle client**

Create `src/lib/db/index.ts`:

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.NEON_DB_URL!);

export const db = drizzle({ client: sql, schema });
```

- [ ] **Step 3: Create schema**

Create `src/lib/db/schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ── Users (Auth.js managed + custom fields) ─────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Sessions (Auth.js managed) ──────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

// ── Auth.js Accounts (for future OAuth providers) ───────────────────
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: varchar('token_type', { length: 255 }),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
});

// ── Verification Tokens (Auth.js) ───────────────────────────────────
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [uniqueIndex('verification_token_idx').on(t.identifier, t.token)]
);

// ── Linked Accounts (Buffer, Instagram credentials) ─────────────────
export const linkedAccounts = pgTable(
  'linked_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    accessToken: text('access_token'),
    metadata: jsonb('metadata'),
    connectedAt: timestamp('connected_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('linked_account_user_provider_idx').on(t.userId, t.provider)]
);

// ── Brands ──────────────────────────────────────────────────────────
export const brands = pgTable(
  'brands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    primaryColor: varchar('primary_color', { length: 7 }).notNull().default('#14b8a6'),
    secondaryColor: varchar('secondary_color', { length: 7 }).notNull().default('#0d9488'),
    logoUrl: text('logo_url'),
    instagramHandle: varchar('instagram_handle', { length: 100 }),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('brand_user_slug_idx').on(t.userId, t.slug)]
);

// ── Posts ────────────────────────────────────────────────────────────
export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
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
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── Post Analytics ──────────────────────────────────────────────────
export const postAnalytics = pgTable('post_analytics', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── User Preferences ────────────────────────────────────────────────
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  defaultBrandId: uuid('default_brand_id').references(() => brands.id, {
    onDelete: 'set null',
  }),
  defaultOverlayStyle: varchar('default_overlay_style', { length: 20 })
    .notNull()
    .default('editorial'),
  defaultTextPosition: varchar('default_text_position', { length: 10 })
    .notNull()
    .default('center'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('UTC'),
});

// ── Type exports ────────────────────────────────────────────────────
export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;
export type InsertBrand = typeof brands.$inferInsert;
export type SelectBrand = typeof brands.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
export type SelectPost = typeof posts.$inferSelect;
export type InsertLinkedAccount = typeof linkedAccounts.$inferInsert;
export type SelectLinkedAccount = typeof linkedAccounts.$inferSelect;
```

- [ ] **Step 4: Generate and run migration**

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: Tables created in Neon. Verify in Neon console.

- [ ] **Step 5: Verify connection**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_DB_URL);
sql('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'').then(r => console.log(r.map(t => t.table_name)));
"
```

Expected: List including `users`, `sessions`, `brands`, `posts`, etc.

- [ ] **Step 6: Commit**

```bash
git add drizzle.config.ts src/lib/db/ drizzle/
git commit -m "feat: add Drizzle schema and Neon database connection"
```

---

## Task 3: Encryption Utility

**Files:**
- Create: `src/lib/encryption.ts`

- [ ] **Step 1: Create encryption module**

Create `src/lib/encryption.ts`:

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(':');

  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

- [ ] **Step 2: Verify it works**

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { encrypt, decrypt } = require('./src/lib/encryption');
const original = 'test-api-key-12345';
const encrypted = encrypt(original);
const decrypted = decrypt(encrypted);
console.log('match:', original === decrypted, 'encrypted:', encrypted.substring(0, 30) + '...');
"
```

Expected: `match: true encrypted: ...`

- [ ] **Step 3: Commit**

```bash
git add src/lib/encryption.ts
git commit -m "feat: add AES-256-GCM encryption utility for API key storage"
```

---

## Task 4: Auth.js v5 Configuration

**Files:**
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth-helpers.ts`

- [ ] **Step 1: Create Auth.js config**

Create `src/auth.ts`:

```typescript
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, accounts, sessions, verificationTokens } from '@/lib/db/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
```

- [ ] **Step 2: Create API route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Create auth helpers**

Create `src/lib/auth-helpers.ts`:

```typescript
import { auth } from '@/auth';

export async function getRequiredSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function getUserId(): Promise<string> {
  const session = await getRequiredSession();
  return session.user.id;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (may need to add `next-auth` type augmentation)

If there's a type error for `session.user.id`, add to `src/auth.ts` at the top:

```typescript
declare module 'next-auth' {
  interface User {
    id?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts src/app/api/auth/ src/lib/auth-helpers.ts
git commit -m "feat: configure Auth.js v5 with credentials provider and Drizzle adapter"
```

---

## Task 5: Middleware + Route Protection

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create middleware**

Create `src/middleware.ts`:

```typescript
export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /login, /register (auth pages)
     * - /api/auth (Auth.js API routes)
     * - /_next (Next.js internals)
     * - /favicon.ico, /logos, static files
     */
    '/((?!login|register|api/auth|_next|favicon\\.ico|logos|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
```

Then update `src/auth.ts` — add the `authorized` callback inside the NextAuth config to handle redirects:

Add to the `callbacks` object in `src/auth.ts`:

```typescript
    async authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage =
        request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/register');

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/', request.nextUrl.origin));
        }
        return true;
      }

      return isLoggedIn;
    },
```

- [ ] **Step 2: Verify middleware runs**

Start the dev server and navigate to `http://localhost:3000`. You should be redirected to `/login`.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts src/auth.ts
git commit -m "feat: add auth middleware for route protection"
```

---

## Task 6: Login + Register Pages

**Files:**
- Create: `src/components/login-form.tsx`
- Create: `src/components/register-form.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/register/page.tsx`
- Create: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Create login form component**

Create `src/components/login-form.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Invalid email or password');
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-500 mx-auto mb-4">
          <span className="text-xl font-bold text-white">S</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Social Studio</h1>
        <p className="text-sm text-zinc-500 mt-1">Sign in to your account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs text-zinc-500">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs text-zinc-500">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white font-medium text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500 mt-6">
        No account?{' '}
        <Link
          href="/register"
          className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create register form component**

Create `src/components/register-form.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
      }

      // Auto sign in after registration
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Account created but sign-in failed. Try logging in.');
        setLoading(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-500 mx-auto mb-4">
          <span className="text-xl font-bold text-white">S</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Create Account</h1>
        <p className="text-sm text-zinc-500 mt-1">Get started with Social Studio</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="name" className="text-xs text-zinc-500">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            placeholder="Your name"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs text-zinc-500">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-10 px-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs text-zinc-500">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full h-10 px-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            placeholder="Min 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white font-medium text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-500 mt-6">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create registration API route**

Create `src/app/api/auth/register/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.insert(users).values({
      name,
      email,
      passwordHash,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Create login page**

Create `src/app/login/page.tsx`:

```typescript
import { LoginForm } from '@/components/login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <LoginForm />
    </div>
  );
}
```

- [ ] **Step 5: Create register page**

Create `src/app/register/page.tsx`:

```typescript
import { RegisterForm } from '@/components/register-form';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <RegisterForm />
    </div>
  );
}
```

- [ ] **Step 6: Create SessionProvider wrapper**

Create `src/components/session-provider.tsx`:

```typescript
'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
```

- [ ] **Step 7: Update root layout**

Modify `src/app/layout.tsx` — wrap children in SessionProvider and conditionally show sidebar for authenticated pages:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Studio",
  description: "Professional social media content creation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

Then create `src/app/(dashboard)/layout.tsx` to hold the sidebar for authenticated pages:

```typescript
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <main className="ml-60 min-h-screen transition-all duration-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">{children}</div>
      </main>
    </>
  );
}
```

Move all existing pages (`page.tsx`, `generate/`, `batch/`, `schedule/`, `analytics/`, `competitors/`) into `src/app/(dashboard)/`.

- [ ] **Step 8: Verify login flow works**

1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:3000` — should redirect to `/login`
3. Navigate to `/register` — register form should appear
4. Cannot login yet (no seed user) — but the pages should render

- [ ] **Step 9: Commit**

```bash
git add src/components/login-form.tsx src/components/register-form.tsx src/components/session-provider.tsx
git add src/app/login/ src/app/register/ src/app/api/auth/register/
git add src/app/layout.tsx src/app/(dashboard)/
git commit -m "feat: add login, register pages and session provider"
```

---

## Task 7: Seed Script (origae account)

**Files:**
- Create: `src/lib/db/seed.ts`

- [ ] **Step 1: Create seed script**

Create `src/lib/db/seed.ts`:

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import * as schema from './schema';
import { encrypt } from '../encryption';

config({ path: '.env.local' });

async function seed() {
  const sql = neon(process.env.NEON_DB_URL!);
  const db = drizzle({ client: sql, schema });

  console.log('Seeding database...');

  // Check if origae user already exists
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, 'origae@socialstudio.app'))
    .limit(1);

  if (existing) {
    console.log('Seed user already exists, skipping.');
    return;
  }

  // Create origae user
  const passwordHash = await bcrypt.hash('origae2026', 12);
  const [user] = await db
    .insert(schema.users)
    .values({
      name: 'Origae',
      email: 'origae@socialstudio.app',
      passwordHash,
    })
    .returning();

  console.log('Created user:', user.email);

  // Create brands
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

  await db.insert(schema.brands).values({
    userId: user.id,
    name: 'PaceBrain',
    slug: 'pacebrain',
    primaryColor: '#3b82f6',
    secondaryColor: '#2563eb',
    instagramHandle: 'pacebrain.app',
  });

  console.log('Created brands: affectly, pacebrain');

  // Link Buffer account if API key exists in env
  const bufferKey = process.env.BUFFER_API_KEY;
  if (bufferKey) {
    await db.insert(schema.linkedAccounts).values({
      userId: user.id,
      provider: 'buffer',
      accessToken: encrypt(bufferKey),
      metadata: {},
    });
    console.log('Linked Buffer account');
  }

  // Create user preferences
  await db.insert(schema.userPreferences).values({
    userId: user.id,
    defaultBrandId: affectly.id,
    defaultOverlayStyle: 'editorial',
    defaultTextPosition: 'center',
    timezone: 'UTC',
  });

  console.log('Created user preferences');
  console.log('Seed complete!');
}

seed().catch(console.error);
```

- [ ] **Step 2: Add seed script to package.json**

Add to `scripts` in `package.json`:

```json
"db:seed": "npx tsx src/lib/db/seed.ts",
"db:push": "npx drizzle-kit push",
"db:generate": "npx drizzle-kit generate",
"db:studio": "npx drizzle-kit studio"
```

- [ ] **Step 3: Run seed**

```bash
npm run db:seed
```

Expected output:
```
Seeding database...
Created user: origae@socialstudio.app
Created brands: affectly, pacebrain
Linked Buffer account
Created user preferences
Seed complete!
```

- [ ] **Step 4: Verify login works**

1. Start dev server
2. Go to `/login`
3. Enter: `origae@socialstudio.app` / `origae2026`
4. Should redirect to `/` with dashboard visible

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/seed.ts package.json
git commit -m "feat: add seed script with origae account, brands, and Buffer link"
```

---

## Task 8: Update Sidebar with User Info

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add user section to sidebar**

Update `src/components/sidebar.tsx` — add `useSession` and `signOut` from `next-auth/react`. Add a settings nav item. Add a user section at the bottom with name, email, and logout button.

Add to `navItems` array:

```typescript
{ href: '/settings', label: 'Settings', icon: Settings },
```

Import `Settings` from `lucide-react` and `useSession`, `signOut` from `next-auth/react`.

Add at the bottom of the sidebar (before closing `</aside>`), a user footer:

```typescript
{/* User footer */}
<div className="mt-auto border-t border-zinc-800/60 p-3">
  {session?.user && (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
        {session.user.name?.[0]?.toUpperCase() || '?'}
      </div>
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-300 truncate">
            {session.user.name}
          </p>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 2: Verify sidebar shows user info**

Login and verify the sidebar shows the user's name initial and a sign out button.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: add user info and logout to sidebar"
```

---

## Task 9: Settings Page + Buffer Connection

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/components/settings-panel.tsx`
- Create: `src/app/api/linked-accounts/route.ts`

- [ ] **Step 1: Create linked accounts API**

Create `src/app/api/linked-accounts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedAccounts } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth-helpers';
import { encrypt, decrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const userId = await getUserId();
    const accounts = await db
      .select({
        id: linkedAccounts.id,
        provider: linkedAccounts.provider,
        metadata: linkedAccounts.metadata,
        connectedAt: linkedAccounts.connectedAt,
      })
      .from(linkedAccounts)
      .where(eq(linkedAccounts.userId, userId));

    return NextResponse.json({ accounts });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { provider, accessToken } = await request.json();

    if (!provider || !accessToken) {
      return NextResponse.json(
        { error: 'provider and accessToken are required' },
        { status: 400 }
      );
    }

    // Validate Buffer token by calling their API
    if (provider === 'buffer') {
      const res = await fetch('https://api.buffer.com/user.json', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Invalid Buffer API key' },
          { status: 400 }
        );
      }
    }

    const encryptedToken = encrypt(accessToken);

    // Upsert: insert or update on conflict
    const [existing] = await db
      .select()
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.provider, provider)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(linkedAccounts)
        .set({
          accessToken: encryptedToken,
          updatedAt: new Date(),
        })
        .where(eq(linkedAccounts.id, existing.id));
    } else {
      await db.insert(linkedAccounts).values({
        userId,
        provider,
        accessToken: encryptedToken,
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const { provider } = await request.json();

    await db
      .delete(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.userId, userId),
          eq(linkedAccounts.provider, provider)
        )
      );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

- [ ] **Step 2: Create settings panel component**

Create `src/components/settings-panel.tsx` — a form where users can paste their Buffer API key with a connect/disconnect button, see connection status, and manage preferences. Style consistently with the existing dark theme. Use the `glass-card` CSS class from the existing components.

- [ ] **Step 3: Create settings page**

Create `src/app/(dashboard)/settings/page.tsx`:

```typescript
import { SettingsPanel } from '@/components/settings-panel';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your connected accounts and preferences
        </p>
      </div>
      <SettingsPanel />
    </div>
  );
}
```

- [ ] **Step 4: Verify Buffer connection flow**

1. Go to `/settings`
2. Paste a Buffer API key
3. Click Connect — should validate and save
4. Refresh — should show "Connected"

- [ ] **Step 5: Commit**

```bash
git add src/app/api/linked-accounts/ src/components/settings-panel.tsx src/app/(dashboard)/settings/
git commit -m "feat: add settings page with Buffer account linking"
```

---

## Task 10: Brand Manager + Logo Upload

**Files:**
- Create: `src/components/brand-manager.tsx`
- Create: `src/app/api/brands/route.ts`
- Create: `src/app/api/brands/logo/route.ts`

- [ ] **Step 1: Create brands CRUD API**

Create `src/app/api/brands/route.ts` — GET returns user's brands, POST creates a new brand, PUT updates a brand, DELETE removes a brand. All scoped by `getUserId()`.

- [ ] **Step 2: Create logo upload API**

Create `src/app/api/brands/logo/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { getUserId } from '@/lib/auth-helpers';
import { removeWhiteBackground } from '@/lib/image-processing';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    await getUserId();

    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Write to temp file for removeWhiteBackground
    const tmpDir = os.tmpdir();
    const tmpInput = path.join(tmpDir, `logo-input-${Date.now()}.png`);
    const tmpOutput = path.join(tmpDir, `logo-output-${Date.now()}.png`);

    // First resize to max 1000x1000
    const resized = await sharp(buffer)
      .resize(1000, 1000, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();

    await fs.writeFile(tmpInput, resized);
    await removeWhiteBackground(tmpInput, tmpOutput);

    const processed = await fs.readFile(tmpOutput);

    // Cleanup temp files
    await fs.unlink(tmpInput).catch(() => {});
    await fs.unlink(tmpOutput).catch(() => {});

    // Upload to Vercel Blob
    const blob = await put(`logos/${Date.now()}-${file.name}`, processed, {
      access: 'public',
      contentType: 'image/png',
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create brand manager component**

Create `src/components/brand-manager.tsx` — shows a list of user's brands, each with name, slug, colors, logo preview, instagram handle. Has "Add Brand" button. Each brand has edit/delete. Logo upload uses a file input that POSTs to `/api/brands/logo` and saves the returned URL. Style consistently with the existing dark theme.

- [ ] **Step 4: Add brand manager to settings page**

Update `src/app/(dashboard)/settings/page.tsx` to include `<BrandManager />` below the settings panel.

- [ ] **Step 5: Verify brand management**

1. Go to `/settings`
2. See existing seeded brands (Affectly, PaceBrain)
3. Upload a logo for a brand
4. Create a new brand
5. Edit and delete brands

- [ ] **Step 6: Commit**

```bash
git add src/app/api/brands/ src/components/brand-manager.tsx src/app/(dashboard)/settings/
git commit -m "feat: add brand manager with logo upload"
```

---

## Task 11: Refactor Buffer Library for Per-User Keys

**Files:**
- Modify: `src/lib/buffer.ts`
- Modify: `src/app/api/buffer/route.ts`

- [ ] **Step 1: Update buffer.ts**

Change the module-level `BUFFER_API_KEY` constant. Instead, every exported function gets an `apiKey` parameter as the first argument. Remove the `const BUFFER_API_KEY = process.env.BUFFER_API_KEY || '';` line.

Update function signatures:
- `getOrganizationsAndChannels(apiKey: string)`
- `createPost(apiKey: string, ...)`
- `createIdea(apiKey: string, ...)`
- `getSentPosts(apiKey: string)`
- `getQueuedPosts(apiKey: string)`
- `getSentPostsWithAnalytics(apiKey: string)`

Replace all internal references to `BUFFER_API_KEY` with the `apiKey` parameter.

- [ ] **Step 2: Update buffer API route**

Modify `src/app/api/buffer/route.ts`:

- Import `getUserId` from `@/lib/auth-helpers`
- Import `decrypt` from `@/lib/encryption`
- Import `linkedAccounts` from `@/lib/db/schema` and `db` from `@/lib/db`
- At the top of both GET and POST handlers, get the user's Buffer key:

```typescript
const userId = await getUserId();
const [bufferAccount] = await db
  .select()
  .from(linkedAccounts)
  .where(
    and(
      eq(linkedAccounts.userId, userId),
      eq(linkedAccounts.provider, 'buffer')
    )
  )
  .limit(1);

if (!bufferAccount?.accessToken) {
  return NextResponse.json(
    { error: 'Buffer not connected. Go to Settings to link your account.' },
    { status: 403 }
  );
}

const bufferApiKey = decrypt(bufferAccount.accessToken);
```

Then pass `bufferApiKey` as the first argument to all buffer.ts function calls.

- [ ] **Step 3: Verify Buffer still works**

1. Login as origae
2. Go to Schedule page — should load channels from seeded Buffer key
3. Go to Create page — generate a post and schedule it

- [ ] **Step 4: Commit**

```bash
git add src/lib/buffer.ts src/app/api/buffer/route.ts
git commit -m "refactor: buffer library accepts per-user API key"
```

---

## Task 12: Add Auth to Remaining API Routes

**Files:**
- Modify: `src/app/api/pixabay/route.ts`
- Modify: `src/app/api/scrape/route.ts`
- Modify: `src/app/api/logo/route.ts`

- [ ] **Step 1: Add auth check to pixabay route**

Add at the top of the GET handler:

```typescript
import { getUserId } from '@/lib/auth-helpers';
// ...
await getUserId(); // Throws 401 if not authenticated
```

Wrap in try/catch — if `getUserId()` throws, return 401.

- [ ] **Step 2: Add auth check to scrape route**

Same pattern. Additionally, for the POST handler that accepts an Instagram handle, validate it belongs to one of the user's brands.

- [ ] **Step 3: Add auth check to logo route**

Same auth check pattern for both GET and POST.

- [ ] **Step 4: Verify all routes require auth**

Test each route without auth — should return 401:

```bash
curl -s http://localhost:3000/api/pixabay?q=test | head -c 100
curl -s http://localhost:3000/api/logo -X GET | head -c 100
```

Expected: `{"error":"Unauthorized"}`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/pixabay/ src/app/api/scrape/ src/app/api/logo/
git commit -m "feat: add auth checks to all API routes"
```

---

## Task 13: Update Image Processing for Dynamic Logos

**Files:**
- Modify: `src/lib/image-processing.ts`

- [ ] **Step 1: Update compositeLogoOnImage signature**

Add an optional `logoUrl` parameter. When provided, download the logo from the URL instead of reading from `public/logos/`. Cache downloaded logos in a `Map` keyed by URL to avoid re-downloading on every request within the same server instance.

```typescript
export async function compositeLogoOnImage(
  baseImageBuffer: Buffer,
  brand: 'affectly' | 'pacebrain',
  logoScale: number = 0.22,
  logoUrl?: string | null,
): Promise<Buffer> {
```

If `logoUrl` is provided:
- Fetch the image from the URL
- Use it as the logo instead of the local file
- Skip the brand name SVG text (the uploaded logo should contain the brand identity)

If `logoUrl` is null/undefined, fall back to the existing local file behavior.

- [ ] **Step 2: Update callers to pass logoUrl**

In `src/app/api/logo/route.ts` and `src/app/api/buffer/route.ts`, when processing an image, look up the brand's `logo_url` from the database and pass it to `compositeLogoOnImage`.

- [ ] **Step 3: Verify logo processing works with both paths**

1. Generate a post for origae's brands (no custom logo uploaded yet) — should use local files
2. Upload a logo to a brand via settings
3. Generate a post for that brand — should use the uploaded logo

- [ ] **Step 4: Commit**

```bash
git add src/lib/image-processing.ts src/app/api/logo/route.ts src/app/api/buffer/route.ts
git commit -m "feat: support dynamic logo URLs from user brands"
```

---

## Task 14: Posts CRUD API + Persistence

**Files:**
- Create: `src/app/api/posts/route.ts`

- [ ] **Step 1: Create posts API**

Create `src/app/api/posts/route.ts`:

- **GET**: Return user's posts, optionally filtered by `brandId`, `status`. Paginated with `limit` and `offset` query params.
- **POST**: Create a new post (save draft). Requires `brandId`, `caption`. Optional: `hashtags`, `hookText`, `contentType`, `overlayStyle`, `textPosition`, `fontSize`, `sourceImageUrl`, `processedImageUrl`, `status`.
- **PUT**: Update a post by `id`. Verify the post belongs to the current user.
- **DELETE**: Delete a post by `id`. Verify ownership.

All scoped by `getUserId()`.

- [ ] **Step 2: Update post-generator to save posts**

Modify `src/components/post-generator.tsx`:
- The `savePost` function should POST to `/api/posts` instead of only saving to local state
- Load saved posts from `/api/posts?status=draft` on mount
- When scheduling to Buffer succeeds, update the post status to 'scheduled' via PUT

- [ ] **Step 3: Update batch-gallery to persist**

Modify `src/components/batch-gallery.tsx`:
- When batch generates posts, save each to DB via POST `/api/posts`
- When scheduling, update status via PUT
- Load existing batch posts from DB on mount

- [ ] **Step 4: Verify persistence**

1. Generate a post → save it
2. Refresh the page → saved post should still be there
3. Schedule a post → status should update to 'scheduled'

- [ ] **Step 5: Commit**

```bash
git add src/app/api/posts/ src/components/post-generator.tsx src/components/batch-gallery.tsx
git commit -m "feat: persist posts to database with full CRUD"
```

---

## Task 15: Analytics + Command Center from DB

**Files:**
- Modify: `src/components/analytics-dashboard.tsx`
- Modify: `src/components/command-center.tsx`

- [ ] **Step 1: Update analytics dashboard**

Modify `src/components/analytics-dashboard.tsx` to load post analytics from the database. Fetch from `/api/posts?status=scheduled&status=published` and `/api/buffer?action=analyze` (which now uses per-user Buffer key).

- [ ] **Step 2: Update command center**

Modify `src/components/command-center.tsx` to show user-specific stats:
- Total posts created (from DB)
- Posts scheduled this week
- Connected accounts count
- Active brands count

Fetch these from a new endpoint or aggregate from existing endpoints.

- [ ] **Step 3: Verify dashboards**

1. Login as origae
2. Home page should show stats from DB
3. Analytics page should show user's post performance

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics-dashboard.tsx src/components/command-center.tsx
git commit -m "feat: analytics and command center read from user-scoped database"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Test full registration flow**

1. Go to `/register`
2. Create a new account
3. Login → see empty dashboard (no brands, no Buffer)
4. Go to Settings → create a brand with logo
5. Connect Buffer
6. Generate a post → save → schedule
7. Verify post appears in schedule

- [ ] **Step 2: Test origae account preserved**

1. Login as `origae@socialstudio.app` / `origae2026`
2. Verify both brands exist
3. Verify Buffer is connected
4. Generate and schedule a post

- [ ] **Step 3: Test isolation**

1. Login as new user
2. Verify they cannot see origae's brands or posts
3. Verify Buffer is not connected (must link their own)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete SaaS conversion — multi-tenant auth, brands, posts, settings"
```
