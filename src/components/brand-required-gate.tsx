'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Sparkles } from 'lucide-react';

interface Brand {
  id: string;
  name: string;
  instagramHandle: string | null;
}

export function BrandRequiredGate({ children, feature }: { children: React.ReactNode; feature: string }) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setBrands(data?.brands ?? []);
      })
      .catch(() => setBrands([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!brands || brands.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-900/80 p-10 text-center space-y-6 max-w-lg mx-auto mt-10">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-500/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-teal-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Set up your brand first</h2>
        <p className="text-sm text-white leading-relaxed">
          Before you can {feature}, you need to add your brand details — at minimum your brand name and Instagram handle.
          You can do this during onboarding or in Settings.
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-3 text-left">
            <span className="shrink-0 w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-xs font-semibold text-teal-400">1</span>
            <p className="text-sm text-white">Go to <Link href="/settings" className="text-teal-400 underline">Settings</Link> and add your brand name and Instagram handle</p>
          </div>
          <div className="flex items-start gap-3 text-left">
            <span className="shrink-0 w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-xs font-semibold text-teal-400">2</span>
            <p className="text-sm text-white">Connect your Buffer API key for scheduling posts</p>
          </div>
          <div className="flex items-start gap-3 text-left">
            <span className="shrink-0 w-6 h-6 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-xs font-semibold text-teal-400">3</span>
            <p className="text-sm text-white">Connect at least one image source (Pixabay recommended)</p>
          </div>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-500 transition"
        >
          <Settings className="w-4 h-4" />
          Go to Settings
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
