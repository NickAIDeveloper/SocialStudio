'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  PenSquare,
  Grid3x3,
  Calendar,
  BarChart3,
  Users,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/generate', label: 'Create', icon: PenSquare },
  { href: '/batch', label: 'Batch', icon: Grid3x3 },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/competitors', label: 'Competitors', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-zinc-800/60 bg-zinc-950 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-zinc-800/60">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-blue-500">
          <span className="text-sm font-bold text-white">S</span>
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            Social Studio
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-3 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-800/80 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-teal-400" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Brand filter */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Brand
          </p>
          <div className="flex rounded-lg bg-zinc-900 p-0.5">
            {(['all', 'affectly', 'pacebrain'] as const).map((brand) => (
              <span
                key={brand}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition-colors cursor-default',
                  brand === 'all'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500'
                )}
              >
                {brand === 'all'
                  ? 'All'
                  : brand === 'affectly'
                    ? 'Affectly'
                    : 'PaceBrain'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="border-t border-zinc-800/60 px-2 py-2">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 transition-colors"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {/* User footer */}
      {session?.user && (
        <div className="mt-auto border-t border-zinc-800/60 px-2 py-3">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-100">
              {session.user.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm font-medium text-zinc-200">
                  {session.user.name}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="mt-0.5 text-left text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
