'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block" aria-label="GoViraleza home">
            <Image src="/logo-goviraleza.png" alt="GoViraleza" width={52} height={36} className="mx-auto mb-2 rounded-lg" />
          </Link>
          <h1 className="text-2xl font-bold text-(--txt)">Reset your password</h1>
          <p className="mt-1 text-sm text-(--muted)">
            {sent ? 'Check your email for a reset link' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg bg-(--violet-12) border border-(--violet-24) px-4 py-3 text-sm text-(--violet-bright)">
              If an account exists with that email, you will receive a password reset link shortly.
            </div>
            <Link href="/login" className="inline-block rounded px-1 py-1 text-sm text-(--violet-bright) hover:text-(--violet)">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="surface-card rounded-2xl p-6 backdrop-blur-sm">
            {error && (
              <div role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="mb-6">
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-(--txt)">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-3 py-2 text-sm text-(--txt) placeholder-(--muted-2) outline-none transition-colors focus:border-(--violet) focus:ring-2 focus:ring-(--violet-24)"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-(--violet) px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
            <p className="mt-4 text-center text-sm text-(--muted)">
              Remember your password?{' '}
              <Link href="/login" className="font-medium text-(--violet-bright) hover:text-(--violet)">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
