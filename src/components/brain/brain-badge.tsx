'use client';
import { useEffect, useState } from 'react';

interface Props { brandId: string; }

interface BrainData {
  brain: { briefVersion: number; generatedAt: string; briefMd: string; lastRunStatus: string } | null;
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BrainBadge({ brandId }: Props) {
  const [data, setData] = useState<BrainData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/brain?brandId=${brandId}`)
      .then((r) => r.json())
      .then((j) => { if (active) setData(j); });
    return () => { active = false; };
  }, [brandId]);

  if (!data?.brain) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-(--violet-12) text-(--violet-bright) border border-(--violet-24)"
        title="Click to view brand brain"
      >
        🧠 Brain v{data.brain.briefVersion} · {rel(data.brain.generatedAt)}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <pre className="whitespace-pre-wrap text-sm font-sans">{data.brain.briefMd}</pre>
          </div>
        </div>
      )}
    </>
  );
}
