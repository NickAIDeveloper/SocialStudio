'use client';

import { getHealthVerdict } from '@/lib/health-score';

interface HealthScoreProps {
  score: number;
  summary: string;
}

const COLOR_MAP = {
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#10b981',
} as const;

export default function HealthScore({ score, summary }: HealthScoreProps) {
  const verdict = getHealthVerdict(score);
  const color = COLOR_MAP[verdict.color];

  const radius = 60;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const normalizedScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (normalizedScore / 100) * circumference;
  const size = (radius + strokeWidth) * 2;

  return (
    <div className="glass-card border border-zinc-800/50 p-5 flex items-center gap-5">
      <div className="shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={strokeWidth}
          />
          {/* Score arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
          {/* Score number */}
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-white text-3xl font-bold"
            style={{ fontSize: 32, fontWeight: 700 }}
          >
            {normalizedScore}
          </text>
        </svg>
      </div>

      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold" style={{ color }}>
          {verdict.label}
        </p>
        <p className="text-sm text-white leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}
