'use client';

import { useState, useEffect } from 'react';

interface IgAccount {
  id: string;
  igUserId: string;
  igUsername: string | null;
  igAccountType: string | null;
  name: string | null;
  profilePictureUrl: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
}

interface IgAccountPickerProps {
  value: string | null;
  onChange: (igUserId: string | null) => void;
}

export function IgAccountPicker({ value, onChange }: IgAccountPickerProps) {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/meta/instagram/accounts', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: IgAccount[] } | null) => {
        setAccounts(json?.data ?? []);
      })
      .catch(() => {
        // swallow; show empty state
      })
      .finally(() => setLoading(false));
  }, []);

  if (!loading && accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span>No Instagram accounts connected.</span>
        <a
          href="/settings"
          className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
        >
          Connect in Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-zinc-400 whitespace-nowrap">IG account</label>
      <select
        disabled={loading}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
      >
        <option value="">{loading ? 'Loading...' : 'All accounts'}</option>
        {accounts.map((a) => (
          <option key={a.igUserId} value={a.igUserId}>
            {a.igUsername ? `@${a.igUsername}` : a.igUserId}
          </option>
        ))}
      </select>
    </div>
  );
}
