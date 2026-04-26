import type { InsightCard } from '@/lib/health-score';

export function encodeLearnings(ids: Iterable<string>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(encodeURIComponent(id));
  }
  return out.join(',');
}

export function decodeLearnings(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
}

export function filterInsightsByLearnings(
  insights: InsightCard[],
  ids: string[],
): InsightCard[] {
  if (ids.length === 0) return insights;
  const set = new Set(ids);
  return insights.filter((i) => set.has(i.id));
}
