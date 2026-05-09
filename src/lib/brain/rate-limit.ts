interface UsageReport {
  maxPct: number;
  details: { source: string; pct: number }[];
}

function maxOf(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  let max = 0;
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      max = Math.max(max, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          for (const v of Object.values(item as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v)) {
              max = Math.max(max, v);
            }
          }
        }
      }
    } else if (value && typeof value === 'object') {
      max = Math.max(max, maxOf(value));
    }
  }
  return max;
}

function parseHeader(headers: Headers, name: string): unknown {
  const raw = headers.get(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseUsage(headers: Headers): UsageReport {
  const sources = ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage'];
  const details: { source: string; pct: number }[] = [];
  let maxPct = 0;
  for (const name of sources) {
    const parsed = parseHeader(headers, name);
    const pct = maxOf(parsed);
    details.push({ source: name, pct });
    maxPct = Math.max(maxPct, pct);
  }
  return { maxPct, details };
}

export function isThrottled(headers: Headers, thresholdPct = 80): boolean {
  return parseUsage(headers).maxPct >= thresholdPct;
}
