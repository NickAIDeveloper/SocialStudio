import type { BrainFormula, EmojiDensity, IgFormat } from './types';

const REQUIRED_HEADERS = [
  "## What's working",
  "## What's not working",
  '## Formula for the next 7 days',
  '## Topics to lean into',
  '## Topics to drop',
  '## Competitor watch',
];

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateBrief(md: string): ValidationResult {
  let cursor = 0;
  for (const h of REQUIRED_HEADERS) {
    const idx = md.indexOf(h, cursor);
    if (idx === -1) return { ok: false, reason: `missing_or_out_of_order:${h}` };
    cursor = idx + h.length;
  }
  return { ok: true };
}

const DAY_TO_DOW: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function readField(md: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, 'i');
  const m = md.match(re);
  return m ? m[1].trim() : null;
}

function parseFormat(s: string | null): IgFormat | null {
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.includes('REEL')) return 'REEL';
  if (upper.includes('CAROUSEL')) return 'CAROUSEL';
  if (upper.includes('IMAGE')) return 'IMAGE';
  return null;
}

function parseSlot(s: string | null): { dow: number; hour: number } | null {
  if (!s) return null;
  const dayMatch = s.match(/[A-Za-z]+/);
  const dayKey = dayMatch?.[0]?.toLowerCase();
  const dow = dayKey !== undefined ? DAY_TO_DOW[dayKey] : undefined;
  if (dow === undefined) return null;

  const numMatch = s.match(/(\d{1,2})\s*(am|pm)?/i);
  if (!numMatch) return null;
  let hour = parseInt(numMatch[1], 10);
  const ampm = numMatch[2]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return { dow, hour };
}

function parseCaptionShape(s: string | null): {
  lines: number;
  paragraphs: number;
  emojiDensity: EmojiDensity;
} | null {
  if (!s) return null;
  const linesMatch = s.match(/(\d+)\s*lines?/i);
  const paraMatch = s.match(/(\d+)\s*paragraphs?/i);
  const densityMatch = s.match(/emoji\s*density:\s*(low|medium|high)/i);
  if (!linesMatch || !paraMatch || !densityMatch) return null;
  return {
    lines: parseInt(linesMatch[1], 10),
    paragraphs: parseInt(paraMatch[1], 10),
    emojiDensity: densityMatch[1].toLowerCase() as EmojiDensity,
  };
}

export function parseFormula(md: string): BrainFormula | null {
  const idx = md.indexOf('## Formula for the next 7 days');
  if (idx === -1) return null;
  const next = md.indexOf('## ', idx + 5);
  const section = md.slice(idx, next === -1 ? undefined : next);

  const format = parseFormat(readField(section, 'Format'));
  const slot = parseSlot(readField(section, 'Best slot'));
  const shape = parseCaptionShape(readField(section, 'Caption shape'));

  if (!format || !slot || !shape) return null;
  return { format, bestSlot: slot, captionShape: shape };
}
