// Plain-language translations for the Autopilot UI.
// Each helper returns a short, scannable phrase a non-expert would understand.

export type IgFormat = 'REEL' | 'CAROUSEL' | 'IMAGE';
export type HookPattern = 'question' | 'stat' | 'imperative' | 'other';
export type EmojiDensity = 'low' | 'medium' | 'high';

export function humanFormat(f: IgFormat | string | null | undefined): string {
  if (f === 'REEL') return 'Short video (Reel)';
  if (f === 'CAROUSEL') return 'Swipeable carousel';
  if (f === 'IMAGE') return 'Single photo';
  return f ?? '—';
}

export function humanHook(p: HookPattern | string | null | undefined): string {
  if (p === 'stat') return 'Stat-led (uses numbers)';
  if (p === 'question') return 'Question hook';
  if (p === 'imperative') return 'Action-first';
  if (p === 'other') return 'Conversational';
  return p ?? '—';
}

export function humanEmoji(d: EmojiDensity | string | null | undefined): string {
  if (d === 'low') return 'Few emojis';
  if (d === 'medium') return 'Some emojis';
  if (d === 'high') return 'Lots of emojis';
  return d ?? '—';
}

export function humanCaptionShape(lines: number, paragraphs: number): string {
  return `~${lines} lines · ${paragraphs} paragraphs`;
}

export function humanEngagementAvg(n: number): string {
  return `${n.toLocaleString()} likes + comments per post`;
}

export function humanDow(dow: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow] ?? '—';
}

export function humanHour(h: number): string {
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}
