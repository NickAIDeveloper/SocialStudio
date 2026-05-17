const SECTION_HEADERS = [
  "## What's working",
  "## What's not working",
  '## Formula for the next 7 days',
  '## Topics to lean into',
  '## Topics to drop',
  '## Competitor watch',
] as const;

export type BriefSectionKey =
  | 'working'
  | 'notWorking'
  | 'formula'
  | 'leanInto'
  | 'drop'
  | 'competitorWatch';

const HEADER_TO_KEY: Record<(typeof SECTION_HEADERS)[number], BriefSectionKey> = {
  "## What's working": 'working',
  "## What's not working": 'notWorking',
  '## Formula for the next 7 days': 'formula',
  '## Topics to lean into': 'leanInto',
  '## Topics to drop': 'drop',
  '## Competitor watch': 'competitorWatch',
};

export type BriefSections = Record<BriefSectionKey, string[]>;

const EMPTY: BriefSections = {
  working: [],
  notWorking: [],
  formula: [],
  leanInto: [],
  drop: [],
  competitorWatch: [],
};

function extractBullets(section: string): string[] {
  return section
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^[-*]\s+(.+)$/);
      return match ? match[1].trim() : null;
    })
    .filter((s): s is string => s !== null && s !== '—' && s.length > 0);
}

export function parseBriefSections(md: string | null | undefined): BriefSections {
  if (!md) return { ...EMPTY };
  const out: BriefSections = { ...EMPTY };

  for (let i = 0; i < SECTION_HEADERS.length; i++) {
    const header = SECTION_HEADERS[i];
    const start = md.indexOf(header);
    if (start === -1) continue;
    const after = start + header.length;
    const next = md.indexOf('## ', after);
    const body = md.slice(after, next === -1 ? undefined : next);
    out[HEADER_TO_KEY[header]] = extractBullets(body);
  }

  return out;
}
