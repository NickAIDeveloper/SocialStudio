'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { ChevronUp, LogOut, Settings, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!session?.user) return null;

  const initial = session.user.name?.charAt(0).toUpperCase() ?? session.user.email?.charAt(0).toUpperCase() ?? '?';
  const label = session.user.name ?? session.user.email ?? 'Account';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-(--line) bg-(--surface) px-3 py-2 text-left text-sm text-(--txt) transition-colors hover:bg-(--surface-2)"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-(--cyan) to-(--violet) text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-medium text-(--txt)">{label}</span>
          {session.user.email && session.user.name && (
            <span className="truncate text-[11px] text-(--muted-2)">{session.user.email}</span>
          )}
        </span>
        <ChevronUp className={cn('h-4 w-4 shrink-0 text-(--muted-2) transition-transform', !open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-(--line) bg-(--surface) py-1 shadow-xl shadow-black/40"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-(--txt) hover:bg-white/[0.04]"
          >
            <User className="h-4 w-4 text-(--muted)" />
            Profile
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-(--txt) hover:bg-white/[0.04]"
          >
            <Settings className="h-4 w-4 text-(--muted)" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: '/login' });
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--txt) hover:bg-white/[0.04]"
          >
            <LogOut className="h-4 w-4 text-(--muted)" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
