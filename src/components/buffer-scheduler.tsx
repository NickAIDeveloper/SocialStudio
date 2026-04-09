'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { cachedBufferFetch, invalidateBufferCache } from '@/lib/buffer-cache';

interface BufferChannel {
  id: string;
  name: string;
  service: string;
  avatar: string;
}

interface BufferOrganization {
  id: string;
  name: string;
  channels: BufferChannel[];
}

interface ApiError {
  error: string;
  detail?: string;
}

export function BufferScheduler() {
  const [organizations, setOrganizations] = useState<BufferOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mountedRef = useRef(false);

  const loadChannels = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setError(null);
    try {
      if (bypassCache) {
        invalidateBufferCache();
        const response = await fetch('/api/buffer?action=channels');
        if (!response.ok) {
          const errorData: ApiError = await response.json();
          throw errorData;
        }
        const data = await response.json();
        setOrganizations(data.organizations || []);
      } else {
        const data = await cachedBufferFetch<{ organizations: BufferOrganization[] }>('/api/buffer?action=channels');
        if (data) {
          setOrganizations(data.organizations || []);
        } else {
          throw { error: 'Failed to connect to Buffer' };
        }
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'error' in err) {
        setError(err as ApiError);
      } else {
        setError({ error: err instanceof Error ? err.message : 'Failed to connect to Buffer' });
      }
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    loadChannels(true);
  };

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadChannels();
  }, [loadChannels]);

  if (loading) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-12 space-y-6">
        <div className="flex justify-center">
          <div className="inline-block w-8 h-8 border-2 border-zinc-700 border-t-teal-400 rounded-full animate-spin" />
        </div>
        <p className="text-white text-center">Connecting to Buffer...</p>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-zinc-800/50 overflow-hidden">
              <div className="p-4 flex items-center gap-3 border-b border-zinc-800/50">
                <div className="w-10 h-10 rounded-full bg-zinc-800 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-zinc-800/60 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-8">
        <div className="max-w-md mx-auto text-center space-y-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20">
            <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Buffer Connection Issue</h3>
            <p className="text-sm text-amber-400">{error.error}</p>
            {error.detail && (
              <p className="text-xs text-white mt-1 font-mono">{error.detail}</p>
            )}
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-4 text-left">
            <p className="text-xs font-medium uppercase tracking-wider text-white mb-3">Steps to fix</p>
            <ol className="space-y-3 text-sm text-white">
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-xs font-semibold text-teal-400">1</span>
                <span className="pt-0.5">Go to{' '}
                <a href="https://buffer.com/developers/apps" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors">
                  buffer.com/developers/apps
                </a></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-xs font-semibold text-teal-400">2</span>
                <span className="pt-0.5">Generate a personal access token</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-xs font-semibold text-teal-400">3</span>
                <span className="pt-0.5">Go to{' '}
                <a href="/settings" className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors">
                  Settings
                </a>{' '}and paste it under <span className="font-medium text-zinc-200">Buffer</span></span>
              </li>
            </ol>
          </div>

          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 font-medium"
          >
            {retrying ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                Retrying...
              </>
            ) : (
              'Retry Connection'
            )}
          </button>
        </div>
      </div>
    );
  }

  const allChannels = organizations.flatMap(org => org.channels);

  if (allChannels.length === 0) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-12 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800/50 border border-zinc-700/50">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
        </div>
        <p className="text-white">No channels found in Buffer.</p>
        <p className="text-white text-sm">Connect your Instagram accounts in Buffer, then refresh.</p>
        <button
          onClick={loadChannels}
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 hover:text-white transition-colors active:scale-[0.98]"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white">{allChannels.length} connected channel{allChannels.length !== 1 ? 's' : ''}</p>
        <button
          onClick={loadChannels}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white hover:bg-zinc-700 hover:text-white transition-all duration-200 active:scale-[0.98] cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {organizations.map((org) => (
        <div key={org.id} className="space-y-4">
          {org.channels.map((channel) => (
            <div key={channel.id} className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl overflow-hidden transition-all duration-200 hover:border-zinc-700/70">
              <div className="p-4 flex items-center gap-3">
                {channel.avatar ? (
                  <img
                    src={channel.avatar}
                    alt={channel.name}
                    className="w-10 h-10 rounded-full ring-2 ring-zinc-800"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-white text-lg font-bold">
                    {channel.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">{channel.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-zinc-800 text-white text-xs capitalize">{channel.service}</Badge>
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">Connected</Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-800/50">
        <p className="text-sm text-white text-center">
          To schedule posts, use the{' '}
          <a href="/generate" className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors">
            Create page
          </a>
          {' '}— select your image, add a caption, and schedule directly to Buffer.
        </p>
      </div>
    </div>
  );
}
