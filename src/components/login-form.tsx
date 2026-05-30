'use client';

import { useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push('/home');
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <Image src="/logo-goviraleza.png" alt="GoViraleza" width={52} height={36} className="mx-auto mb-2 rounded-lg" />
        <h1 className="text-2xl font-bold text-(--txt)">Welcome back</h1>
        <p className="mt-1 text-sm text-(--muted)">
          Sign in to GoViraleza
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="surface-card rounded-2xl p-6 backdrop-blur-sm"
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-(--txt)"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-3 py-2 text-sm text-(--txt) placeholder-(--muted-2) outline-none transition-colors focus:border-(--violet) focus:ring-2 focus:ring-(--violet-24)"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-(--txt)"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Enter your password"
            className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-3 py-2 text-sm text-(--txt) placeholder-(--muted-2) outline-none transition-colors focus:border-(--violet) focus:ring-2 focus:ring-(--violet-24)"
          />
        </div>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-(--muted) hover:text-(--violet-bright) transition-colors">
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-(--violet) px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-sm text-(--muted)">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-(--violet-bright) hover:text-(--violet) transition-colors"
          >
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
