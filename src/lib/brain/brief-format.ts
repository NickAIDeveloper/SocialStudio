// Turns the brain's markdown brief into structured sections the UI can lay out.
//
// BrainPanel used to dump `briefMd` into a <pre>, so the screen showed literal
// `## What's working` and `**Reach**` asterisks, and three consecutive empty
// sections rendered as three headings each followed by a lone dash. Same defect
// as the raw JSON on /ask: the data was fine, the presentation was raw.
//
// Pure, no I/O.

export type BriefTone = 'action' | 'good' | 'bad' | 'neutral';

export interface BriefItem {
  /** The bolded lead-in, when the bullet has one. */
  label: string | null;
  detail: string;
}

export interface BriefSection {
  id: string;
  title: string;
  tone: BriefTone;
  items: BriefItem[];
}

/**
 * Known headings, in the order they should be READ rather than the order the
 * model writes them. The plan comes first: a marketer opening this wants "what
 * do I do next", not a diagnosis they have to scroll past.
 */
const KNOWN: Array<{ match: RegExp; id: string; title: string; tone: BriefTone; order: number }> = [
  {
    match: /^formula for the next 7 days$/i,
    id: 'plan',
    title: 'Do this in the next 7 days',
    tone: 'action',
    order: 0,
  },
  { match: /^what's working$/i, id: 'working', title: 'What is working', tone: 'good', order: 1 },
  {
    match: /^what's not working$/i,
    id: 'not-working',
    title: 'What is holding you back',
    tone: 'bad',
    order: 2,
  },
  {
    match: /^topics to lean into$/i,
    id: 'topics-to-lean-into',
    title: 'Topics to do more of',
    tone: 'good',
    order: 3,
  },
  { match: /^topics to drop$/i, id: 'topics-to-drop', title: 'Topics to drop', tone: 'bad', order: 4 },
  {
    match: /^competitor watch$/i,
    id: 'competitor-watch',
    title: 'What competitors are doing',
    tone: 'neutral',
    order: 5,
  },
];

const DEFAULT_ORDER = 99;

/**
 * Content that says nothing: a lone dash placeholder, or the debris left when
 * the pipeline had no value to fill in ("Best slot: , —"). Rendering these is
 * worse than omitting them, because a labelled empty value reads as a real
 * finding until you squint at it.
 */
const PLACEHOLDER = /^[\s—–\-,.:]*$/;

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripMarkdown(text: string): string {
  return text.replace(/\*+/g, '').trim();
}

/**
 * Bullets come in two shapes:
 *   - **Label** – detail
 *   - **Label:** detail
 * Anything else is kept whole as an unlabelled item.
 */
function parseItem(line: string): BriefItem | null {
  const body = line.replace(/^[-*]\s+/, '').trim();
  if (!body || PLACEHOLDER.test(body)) return null;

  // [\s\S] rather than . with the `s` flag: this tsconfig targets below es2018.
  const bold = body.match(/^\*\*([\s\S]+?)\*\*\s*([\s\S]*)$/);
  if (bold) {
    const label = stripMarkdown(bold[1]).replace(/:$/, '');
    // The separator between label and detail may be an en/em dash or nothing.
    const detail = stripMarkdown(bold[2].replace(/^[\s:–—-]+/, ''));
    // A label with no value ("Hook patterns" and nothing after it) is dropped:
    // the heading alone tells the reader nothing they can act on.
    if (!label || !detail || PLACEHOLDER.test(detail)) return null;
    return { label, detail };
  }

  const plain = stripMarkdown(body);
  return PLACEHOLDER.test(plain) ? null : { label: null, detail: plain };
}

export function parseBrief(md: string | null | undefined): BriefSection[] {
  const text = String(md ?? '').trim();
  if (!text) return [];

  const sections: BriefSection[] = [];
  const order = new Map<string, number>();

  // Split on `## ` headings, keeping the heading text.
  const blocks = text.split(/^##\s+/m).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.split('\n');
    const heading = stripMarkdown(lines[0] ?? '');
    if (!heading) continue;

    const items = lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map(parseItem)
      .filter((i): i is BriefItem => i !== null);

    // A section with nothing in it is noise; three of them in a row read as a
    // broken page. Drop rather than render an empty heading.
    if (items.length === 0) continue;

    const known = KNOWN.find((k) => k.match.test(heading));
    const section: BriefSection = {
      id: known?.id ?? slug(heading),
      title: known?.title ?? heading,
      tone: known?.tone ?? 'neutral',
      items,
    };
    order.set(section.id, known?.order ?? DEFAULT_ORDER);
    sections.push(section);
  }

  return sections.sort(
    (a, b) => (order.get(a.id) ?? DEFAULT_ORDER) - (order.get(b.id) ?? DEFAULT_ORDER),
  );
}
