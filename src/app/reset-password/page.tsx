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
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, newPassword: password }),
    });
    const data = await res.json();
    if (res.ok) { setDone(true); } else { setError(data.error || 'Failed to reset'); }
    setLoading(false);
  };

  if (!token || !email) {
    return <p className="text-sm text-red-400">Invalid reset link. Please request a new one.</p>;
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-lg bg-teal-500/10 border border-teal-500/20 px-4 py-3 text-sm text-teal-300">
          Password reset successfully.
        </div>
        <Link href="/login" className="text-sm text-teal-400 hover:text-teal-300 inline-block">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-white mb-1">New Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1">Confirm Password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
      </div>
      <button type="submit" disabled={loading}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50 transition">
        {loading ? 'Resetting...' : 'Reset Password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image src="/logo-goviraleza.png" alt="GoViraleza" width={52} height={36} className="mx-auto mb-2 rounded-lg" />
          <h1 className="text-2xl font-bold text-zinc-100">Set new password</h1>
        </div>
        <Suspense fallback={<p className="text-sm text-zinc-400">Loading...</p>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
