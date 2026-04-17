import type { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  unavailable?: boolean;
  unavailableCta?: ReactNode;
  children?: ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  unavailable = false,
  unavailableCta,
  children,
}: SectionHeaderProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>
        )}
      </div>

      {unavailable ? (
        <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
          {unavailableCta ?? <span>Not available on the current source.</span>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
