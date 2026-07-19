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
      <div className="flex items-center gap-2 text-sm text-(--muted)">
        <span>No Instagram accounts connected.</span>
        <a
          href="/settings"
          className="text-(--violet-bright) hover:text-(--violet) underline underline-offset-2"
        >
          Connect in Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-(--muted) whitespace-nowrap">IG account</label>
      <select
        disabled={loading}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="select-field"
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
