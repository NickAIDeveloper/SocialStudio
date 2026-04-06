'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/generate', label: 'Create' },
  { href: '/batch', label: 'Batch' },
  { href: '/schedule', label: 'Schedule' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-50">
      {/* Brand gradient accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-teal-400 via-blue-400 to-orange-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">S</span>
            </div>
            <span className="text-base font-semibold tracking-tight text-zinc-100">
              Social Studio
            </span>
          </Link>
          <div className="flex items-center gap-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/40'
                  )}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-teal-500" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
