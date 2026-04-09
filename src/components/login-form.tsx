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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-blue-500">
          <span className="text-lg font-bold text-white">S</span>
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">Welcome back</h1>
        <p className="mt-1 text-sm text-white">
          Sign in to Social Studio
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-800/60 bg-zinc-900/50 p-6 backdrop-blur-sm"
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-white"
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
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-white"
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
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="mt-4 text-center text-sm text-white">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-teal-400 hover:text-teal-300 transition-colors"
          >
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
