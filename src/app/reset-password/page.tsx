'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword: password }),
      });
      const data = await res.json();
      if (res.ok) { setDone(true); } else { setError(data.error || 'Failed to reset'); }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="space-y-4 text-center">
        <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          This reset link is invalid or has expired.
        </div>
        <Link href="/forgot-password" className="inline-block rounded px-1 py-1 text-sm text-(--violet-bright) hover:text-(--violet)">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg bg-(--violet-12) border border-(--violet-24) px-4 py-3 text-sm text-(--violet-bright)">
          Password reset successfully.
        </div>
        <Link href="/login" className="inline-block rounded px-1 py-1 text-sm text-(--violet-bright) hover:text-(--violet)">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card rounded-2xl p-6 backdrop-blur-sm">
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="mb-4">
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-(--txt)">New password</label>
        <input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-3 py-2 text-sm text-(--txt) placeholder-(--muted-2) outline-none transition-colors focus:border-(--violet) focus:ring-2 focus:ring-(--violet-24)"
        />
      </div>
      <div className="mb-6">
        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-(--txt)">Confirm password</label>
        <input
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Re-enter your new password"
          className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-3 py-2 text-sm text-(--txt) placeholder-(--muted-2) outline-none transition-colors focus:border-(--violet) focus:ring-2 focus:ring-(--violet-24)"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-(--violet) px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Resetting...' : 'Reset password'}
      </button>
      <p className="mt-4 text-center text-sm text-(--muted)">
        <Link href="/login" className="font-medium text-(--violet-bright) hover:text-(--violet)">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--bg) px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block" aria-label="GoViraleza home">
            <Image src="/logo-goviraleza.png" alt="GoViraleza" width={52} height={36} className="mx-auto mb-2 rounded-lg" />
          </Link>
          <h1 className="text-2xl font-bold text-(--txt)">Set new password</h1>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-(--muted)">Loading...</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
