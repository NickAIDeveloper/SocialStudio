'use client';

import { useState, useEffect, useCallback } from 'react';

interface LinkedAccount {
  id: string;
  provider: string;
  metadata: Record<string, unknown> | null;
  connectedAt: string;
}

interface ProviderSectionProps {
  provider: 'buffer' | 'pixabay' | 'unsplash' | 'pexels' | 'gemini_images';
  label: string;
  description: string;
  placeholder: string;
  account: LinkedAccount | null;
  onConnect: (provider: string, token: string) => Promise<void>;
  onDisconnect: (provider: string) => Promise<void>;
}

function ProviderSection({
  provider,
  label,
  description,
  placeholder,
  account,
  onConnect,
  onDisconnect,
}: ProviderSectionProps) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnect = async () => {
    if (!token.trim()) {
      setMessage({ type: 'error', text: 'Please enter an API key' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      await onConnect(provider, token.trim());
      setToken('');
      setMessage({ type: 'success', text: `${label} connected successfully` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Connection failed',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setMessage(null);

    try {
      await onDisconnect(provider);
      setMessage({ type: 'success', text: `${label} disconnected` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Disconnect failed',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{label}</h3>
          <p className="text-sm text-white mt-0.5">{description}</p>
        </div>
        {account ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-400">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Not connected
          </span>
        )}
      </div>

      {account && (
        <div className="rounded-lg bg-zinc-800/40 border border-white/5 px-4 py-3 text-sm text-white">
          Connected on{' '}
          {new Date(account.connectedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      )}

      {!account ? (
        <div className="flex gap-3">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleConnect}
            disabled={loading}
            className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Validating...' : 'Connect'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Disconnecting...' : 'Disconnect'}
        </button>
      )}

      {message && (
        <p
          className={`text-sm ${
            message.type === 'success' ? 'text-teal-400' : 'text-red-400'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch('/api/linked-accounts');
      if (!res.ok) {
        setFetchError('Unable to load account settings. Please refresh the page.');
        return;
      }
      const json = await res.json();
      if (json.success) {
        setAccounts(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err instanceof Error ? err.message : err);
      setFetchError('Unable to load account settings. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const getAccount = (provider: string): LinkedAccount | null =>
    accounts.find((a) => a.provider === provider) ?? null;

  const handleConnect = async (provider: string, accessToken: string) => {
    const res = await fetch('/api/linked-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, accessToken }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'Connection failed');
    }

    await fetchAccounts();
  };

  const handleDisconnect = async (provider: string) => {
    const res = await fetch('/api/linked-accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'Disconnect failed');
    }

    await fetchAccounts();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="glass-card rounded-xl border border-white/5 p-6 animate-pulse"
          >
            <div className="h-5 w-32 rounded bg-zinc-700/50" />
            <div className="mt-2 h-4 w-64 rounded bg-zinc-700/30" />
            <div className="mt-4 h-10 w-full rounded bg-zinc-800/40" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fetchError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {fetchError}
        </div>
      )}
      <ProviderSection
        provider="buffer"
        label="Buffer"
        description="Connect your Buffer account to schedule and publish posts"
        placeholder="Paste your Buffer personal access token"
        account={getAccount('buffer')}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <ProviderSection
        provider="pixabay"
        label="Pixabay"
        description="Connect Pixabay to search and use royalty-free stock images"
        placeholder="Paste your Pixabay API key"
        account={getAccount('pixabay')}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <ProviderSection
        provider="unsplash"
        label="Unsplash"
        description="Access high-quality photos from the Unsplash library"
        placeholder="Paste your Unsplash access key"
        account={getAccount('unsplash')}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <ProviderSection
        provider="pexels"
        label="Pexels"
        description="Search and use free stock photos and videos from Pexels"
        placeholder="Paste your Pexels API key"
        account={getAccount('pexels')}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <ProviderSection
        provider="gemini_images"
        label="Gemini AI Images"
        description="Generate AI-powered images using Google Gemini"
        placeholder="Paste your Gemini API key"
        account={getAccount('gemini_images')}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
    </div>
  );
}
