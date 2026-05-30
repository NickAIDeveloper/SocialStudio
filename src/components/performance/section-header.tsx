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
        <h2 className="text-base font-semibold text-(--txt)">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-(--muted)">{subtitle}</p>
        )}
      </div>

      {unavailable ? (
        <div className="rounded-2xl border border-(--line) bg-(--surface) px-4 py-6 text-center text-sm text-(--muted-2)">
          {unavailableCta ?? <span>Not available on the current source.</span>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
