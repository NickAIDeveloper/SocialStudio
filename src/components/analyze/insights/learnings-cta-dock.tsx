// src/components/analyze/insights/learnings-cta-dock.tsx
'use client';

import Link from 'next/link';
import { Sparkles, Layers } from 'lucide-react';
import { encodeLearnings } from '@/lib/analyze/learnings';

interface LearningsCtaDockProps {
  selectedIds: Set<string>;
  brandId: string | null;
  igUserId: string | null;
}

function buildHref(base: string, opts: LearningsCtaDockProps): string {
  const params = new URLSearchParams();
  if (opts.brandId) params.set('brand', opts.brandId);
  if (opts.igUserId) params.set('ig', opts.igUserId);
  const learnings = encodeLearnings(opts.selectedIds);
  if (learnings) params.set('learnings', learnings);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function LearningsCtaDock(props: LearningsCtaDockProps) {
  const count = props.selectedIds.size;
  if (count === 0) return null;
  return (
    <div className="sticky bottom-3 z-10 mt-2 flex items-center justify-between gap-3 rounded-2xl border border-(--violet-24) bg-(--surface)/90 p-3 backdrop-blur">
      <p className="text-sm text-(--muted)">
        <span className="font-semibold text-(--violet-bright)">{count}</span>{' '}
        {count === 1 ? 'learning selected' : 'learnings selected'}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref('/smart-posts', props)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-(--violet) px-3 py-1.5 text-xs font-semibold text-white hover:bg-(--violet-bright)"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Make 1 Perfect Post
        </Link>
        <Link
          href={buildHref('/create', { ...props })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--violet-24) bg-(--violet-12) px-3 py-1.5 text-xs font-semibold text-(--violet-bright) hover:bg-(--violet-24)"
        >
          <Layers className="h-3.5 w-3.5" />
          Make a 5-pack
        </Link>
      </div>
    </div>
  );
}
