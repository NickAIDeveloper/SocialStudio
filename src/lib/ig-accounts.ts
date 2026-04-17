'use client';

import { useState, useEffect } from 'react';

interface IgAccount {
  id: string;
  igUserId: string;
  igUsername: string | null;
}

interface UseIgAccountsResult {
  accounts: IgAccount[];
  loading: boolean;
}

/**
 * Lightweight hook that fetches the list of connected Instagram accounts.
 * Used by PerformancePage to determine whether the Meta source toggle should
 * be enabled or disabled.
 */
export function useIgAccounts(): UseIgAccountsResult {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/meta/instagram/accounts', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: IgAccount[] } | null) => {
        setAccounts(json?.data ?? []);
      })
      .catch(() => {
        setAccounts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { accounts, loading };
}
