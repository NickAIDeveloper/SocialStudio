'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function ProfilePage() {
  const { data: session } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || '');
      setEmail(session.user.email || '');
    }
  }, [session]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Password updated' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update password' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Profile</h1>
        <p className="text-sm text-(--muted) mt-1">Manage your account details</p>
      </div>

      {message && (
        <div className={`mb-6 rounded-lg px-4 py-3 text-sm ${message.type === 'success' ? 'bg-(--success)/10 border border-(--success)/20 text-(--success)' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6 max-w-xl">
        {/* Profile Info */}
        <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Account Information</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-(--line-strong) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) focus:outline-none focus:ring-2 focus:ring-(--violet)/50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full rounded-lg border border-(--line) bg-(--surface-2) px-4 py-2.5 text-sm text-(--muted-2) cursor-not-allowed"
            />
            <p className="text-xs text-(--muted-2)">Email cannot be changed</p>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="rounded-lg bg-(--violet) px-5 py-2.5 text-sm font-medium text-white hover:bg-(--violet-bright) disabled:opacity-50 transition"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Change Password */}
        <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Change Password</h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-(--line-strong) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) focus:outline-none focus:ring-2 focus:ring-(--violet)/50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-(--line-strong) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) focus:outline-none focus:ring-2 focus:ring-(--violet)/50"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-white">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-(--line-strong) bg-(--surface-2) px-4 py-2.5 text-sm text-(--txt) focus:outline-none focus:ring-2 focus:ring-(--violet)/50"
            />
          </div>

          <button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword}
            className="rounded-lg bg-(--surface-2) px-5 py-2.5 text-sm font-medium text-(--txt) hover:bg-(--surface) disabled:opacity-50 transition border border-(--line-strong)"
          >
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </>
  );
}
