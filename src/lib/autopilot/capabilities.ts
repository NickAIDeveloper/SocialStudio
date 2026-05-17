// Autopilot's actual production capabilities — the pipeline can only ship
// single photos with an overlay. REEL and CAROUSEL planning is not wired
// through god-mode + Buffer yet, so the LLM and brief must be constrained
// to IMAGE only. Add formats here when the upstream pipeline can produce them.

export const SUPPORTED_FORMATS = ['IMAGE'] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export function isSupportedFormat(f: unknown): f is SupportedFormat {
  return typeof f === 'string' && (SUPPORTED_FORMATS as readonly string[]).includes(f);
}

export const FORMAT_OPTIONS_JSON = SUPPORTED_FORMATS.map((f) => `"${f}"`).join(' | ');
