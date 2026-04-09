'use client';

import { useState } from 'react';
import Image from 'next/image';
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Account created but sign-in failed. Please go to login.');
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
        <h1 className="text-2xl font-bold text-zinc-100">Create an account</h1>
        <p className="mt-1 text-sm text-white">
          Get started with GoViraleza
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
            htmlFor="name"
            className="mb-1.5 block text-sm font-medium text-white"
          >
            Name
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>

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
            placeholder="At least 8 characters"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <p className="mt-4 text-center text-sm text-white">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-teal-400 hover:text-teal-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
