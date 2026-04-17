'use client';

import { DAY_LABELS, shortHour, type HeatCell } from '@/lib/meta/ig-analytics';

export function Heatmap({
  heatmap,
}: {
  heatmap: { cells: HeatCell[]; topSlots: Array<{ day: number; hour: number; medianEngagement: number }> };
}) {
  const { cells, topSlots } = heatmap;
  const hasData = cells.some((c) => c.sampleSize > 0);
  if (!hasData) return null;

  const cellAt = (d: number, h: number) => cells.find((c) => c.day === d && c.hour === h);
  const isTop = (d: number, h: number) => topSlots.some((s) => s.day === d && s.hour === h);
  // Compact: show every 2nd hour label to avoid crowding on narrow screens.
  const hourLabels = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-semibold text-white">Best post times</h4>
        <span className="text-[11px] text-white/40">engagement heatmap · your local time</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[10px] border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="w-8" />
              {hourLabels.map((h) => (
                <th key={h} className="w-[14px] font-normal text-white/40 text-center">
                  {h % 3 === 0 ? shortHour(h) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, d) => (
              <tr key={d}>
                <td className="pr-2 text-white/50 text-right">{label}</td>
                {hourLabels.map((h) => {
                  const c = cellAt(d, h);
                  const intensity = c?.intensity ?? 0;
                  const top = isTop(d, h);
                  return (
                    <td
                      key={h}
                      title={
                        c?.sampleSize
                          ? `${label} ${shortHour(h)} — median engagement ${Math.round(c.medianEngagement ?? 0)} (${c.sampleSize} posts)`
                          : `${label} ${shortHour(h)} — no posts`
                      }
                      className={`h-4 w-[14px] rounded-[2px] ${
                        top ? 'ring-1 ring-amber-300' : ''
                      }`}
                      style={{
                        backgroundColor:
                          intensity > 0
                            ? `rgba(16, 185, 129, ${0.15 + intensity * 0.7})`
                            : 'rgba(255,255,255,0.03)',
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {topSlots.length > 0 && (
        <p className="text-xs text-white/60">
          Best performing slots:{' '}
          {topSlots.map((s, i) => (
            <span key={`${s.day}-${s.hour}`}>
              {i > 0 ? ', ' : ''}
              <span className="text-amber-300">
                {DAY_LABELS[s.day]} {shortHour(s.hour)}
              </span>
            </span>
          ))}
          . Aim for these windows.
        </p>
      )}
    </div>
  );
}
