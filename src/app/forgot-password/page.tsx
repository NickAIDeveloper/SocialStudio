'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image src="/logo-goviraleza.png" alt="GoViraleza" width={52} height={36} className="mx-auto mb-2 rounded-lg" />
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
            <Link href="/login" className="text-sm text-(--violet-bright) hover:text-(--violet-bright)">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-(--txt) mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) placeholder-(--muted-2) focus:outline-none focus:border-(--violet) focus:ring-2 focus:ring-(--violet-24)"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-(--violet) px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <p className="text-center text-sm text-(--muted)">
              Remember your password? <Link href="/login" className="text-(--violet-bright) hover:text-(--violet-bright)">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
