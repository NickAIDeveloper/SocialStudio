'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Sparkles,
  Plus,
  Calendar,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/layout/user-menu';

const primaryItems = [
  { href: '/analyze', label: 'Analyze', icon: BarChart3 },
  { href: '/smart-posts', label: 'Smart Posts', icon: Sparkles },
  { href: '/create', label: 'Create', icon: Plus },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-white transition-colors hover:text-zinc-100 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-40 flex w-60 flex-col border-r border-zinc-800/60 bg-zinc-950 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2.5 border-b border-zinc-800/60 px-4">
          <Link href="/analyze" className="flex items-center gap-2.5">
            <Image src="/logo-goviraleza.png" alt="GoViraleza" width={32} height={22} className="shrink-0 rounded" />
            <span className="text-sm font-semibold tracking-tight text-zinc-100">GoViraleza</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-zinc-800/40 hover:text-zinc-100 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {primaryItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-zinc-800/80 text-white'
                    : 'text-white hover:bg-zinc-800/40 hover:text-white',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-teal-400" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-zinc-800/60 px-2 py-2">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/settings')
                ? 'bg-zinc-800/80 text-white'
                : 'text-white hover:bg-zinc-800/40 hover:text-white',
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </Link>
        </div>

        <div className="border-t border-zinc-800/60 px-2 py-2">
          <UserMenu />
        </div>
      </aside>
    </>
  );
}
