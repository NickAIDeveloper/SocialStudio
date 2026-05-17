import { Brain, Target, Send } from 'lucide-react';
import { AutopilotSection } from '@/components/autopilot/autopilot-section';

const PILLARS = [
  { icon: Brain, label: 'Always learning', detail: 'Brain reads your IG nightly' },
  { icon: Target, label: 'Competitor-aware', detail: 'Borrows winning patterns' },
  { icon: Send, label: 'Ships on its own', detail: 'Posts to Buffer at peak slots' },
];

export default function AutopilotPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Autopilot <span aria-hidden>🤖</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your brain learns. Your account ships. You watch the engagement climb.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PILLARS.map(({ icon: Icon, label, detail }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/70 to-zinc-950 p-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-950/40 text-teal-300">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-white">{label}</div>
              <div className="text-xs text-zinc-500">{detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">This week</h2>
          <span className="text-[11px] text-zinc-500">Click a brand to dive in</span>
        </div>
        <AutopilotSection />
      </div>
    </div>
  );
}
