'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BarChart3, Sparkles, Plus, Bot, Megaphone, Menu, Settings, X, Search, MessageCircleQuestion, FlaskConical, Trophy, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/layout/user-menu';

// Grouped by what a marketer is trying to DO, not by which system owns the
// page. `exact` marks a route with children of its own (/ads has /ads/queue and
// /ads/genome under it), so the parent does not light up while a child is open.
const navGroups = [
  {
    // Headings never repeat an item's label: a group called "Create" holding a
    // link called "Create" reads as a duplicate, not a grouping.
    title: 'Make posts',
    items: [
      { href: '/create', label: 'Create', icon: Plus },
      { href: '/smart-posts', label: 'Smart Posts', icon: Sparkles },
    ],
  },
  {
    title: 'Automate',
    items: [{ href: '/autopilot', label: 'Autopilot', icon: Bot }],
  },
  {
    title: 'Advertising',
    items: [
      { href: '/ads', label: 'Ads', icon: Megaphone, exact: true },
      { href: '/ads/queue', label: 'Ad queue', icon: ListChecks },
      { href: '/ads/genome', label: 'Leaderboard', icon: Trophy },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/analyze', label: 'Analyze', icon: BarChart3 },
      { href: '/intel', label: 'Intelligence', icon: FlaskConical },
      { href: '/ask', label: 'Ask', icon: MessageCircleQuestion },
      { href: '/research', label: 'Research', icon: Search },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer when the route changes.
  //
  // Adjusting state during render rather than in an effect: this is React's
  // documented pattern for "reset state when a value changes". An effect would
  // paint the new page with the drawer still open and then close it on a second
  // render — a visible flash, and the cascading render the compiler warns about.
  // Deriving from pathname (rather than closing on link click) also covers
  // back/forward navigation, which never fires a click handler.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  const navLink = (href: string, label: string, Icon: typeof BarChart3, exact = false) => {
    const isActive = exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        data-active={isActive}
        className={cn(
          'group flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-(--violet-12) text-white'
            : 'text-(--muted) hover:bg-white/[0.04] hover:text-(--txt)',
        )}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-(--violet-bright)')} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-(--line) bg-(--surface) text-(--txt) md:hidden"
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
          'fixed bottom-0 left-0 top-0 z-40 flex w-60 flex-col border-r border-(--line) bg-(--sidebar-bg) transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2.5 px-4">
          <Link href="/analyze" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-gradient-to-br from-(--violet) to-(--violet-deep) shadow-[0_0_24px_rgba(139,92,246,0.45)]">
              <Image src="/logo-goviraleza.png" alt="" width={20} height={14} className="rounded" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-(--txt)">GoViraleza</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-(--muted) hover:bg-white/[0.04] hover:text-(--txt) md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.08em] text-(--muted)">
                {group.title}
              </p>
              <nav className="flex flex-col gap-1 px-2">
                {group.items.map((i) =>
                  navLink(i.href, i.label, i.icon, 'exact' in i ? i.exact : false),
                )}
              </nav>
            </div>
          ))}

          <p className="px-4 pb-2 pt-5 text-xs font-semibold uppercase tracking-[0.08em] text-(--muted)">
            Account
          </p>
          <nav className="flex flex-col gap-1 px-2">
            {navLink('/settings', 'Settings', Settings)}
          </nav>
        </div>

        <div className="mt-auto p-2">
          <UserMenu />
        </div>
      </aside>
    </>
  );
}
