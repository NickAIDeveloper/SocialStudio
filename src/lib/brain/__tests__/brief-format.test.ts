import { describe, it, expect } from 'vitest';
import { parseBrief } from '../brief-format';

// The exact brief stored for the Affectly brand (v104), curly quotes,
// non-breaking hyphens, trailing double-spaces and all.
const REAL = `## What's working
- **Image‑only format** – 30 posts in the last 28 days were all IMAGE (100 % of content), matching the pipeline’s single‑photo capability.
- **Posting slot consistency** – Thursday (dow 4) at 11:00 local was the top slot in both windows, representing 30 posts (100 % of activity).

## What's not working
- **Reach** – Total reach over the past 28 days is only 8 accounts; median reach per post is 0, indicating no audience growth.

## Formula for the next 7 days
- **Format:** **IMAGE** – single‑photo posts are the only format the pipeline ships today.
- **Best slot:** Thursday, 11:00 local

## Topics to lean into
—

## Topics to drop
—

## Competitor watch
—`;

describe('parseBrief', () => {
  it('returns nothing for an empty brief', () => {
    expect(parseBrief('')).toEqual([]);
    expect(parseBrief(null)).toEqual([]);
  });

  it('drops sections whose only content is a dash placeholder', () => {
    const ids = parseBrief(REAL).map((s) => s.id);
    expect(ids).not.toContain('topics-to-lean-into');
    expect(ids).not.toContain('topics-to-drop');
    expect(ids).not.toContain('competitor-watch');
  });

  it('leads with the action section, not the diagnosis', () => {
    // "here is what to do" has to come before "here is what is wrong".
    expect(parseBrief(REAL)[0].tone).toBe('action');
    expect(parseBrief(REAL)[0].title).toBe('Do this in the next 7 days');
  });

  it('tags the remaining sections so they can be coloured', () => {
    const tones = parseBrief(REAL).map((s) => s.tone);
    expect(tones).toEqual(['action', 'good', 'bad']);
  });

  it('splits a bullet into its label and detail', () => {
    const working = parseBrief(REAL).find((s) => s.tone === 'good')!;
    expect(working.items[0].label).toBe('Image‑only format');
    expect(working.items[0].detail).toContain('30 posts in the last 28 days');
  });

  it('handles a label whose colon sits inside the bold markers', () => {
    const action = parseBrief(REAL)[0];
    const slot = action.items.find((i) => i.label === 'Best slot')!;
    expect(slot.detail).toBe('Thursday, 11:00 local');
  });

  it('strips every asterisk so no markdown leaks to the screen', () => {
    for (const section of parseBrief(REAL)) {
      for (const item of section.items) {
        expect(item.label ?? '').not.toContain('*');
        expect(item.detail).not.toContain('*');
      }
    }
  });

  it('drops a labelled bullet whose value is empty debris', () => {
    // Real output from the `viajera` brand: the pipeline had no slot to fill in,
    // and "Best slot. , —" reads as a finding until you squint at it.
    const out = parseBrief(
      ['## Formula for the next 7 days', '- **Best slot:** , —', '- **Format:** REEL'].join('\n'),
    );
    expect(out[0].items).toEqual([{ label: 'Format', detail: 'REEL' }]);
  });

  it('drops a label with no value at all', () => {
    const out = parseBrief(
      ['## Formula for the next 7 days', '- **Hook patterns**', '- **Format:** REEL'].join('\n'),
    );
    expect(out[0].items.map((i) => i.label)).toEqual(['Format']);
  });

  it('drops a section that is left empty once its debris is removed', () => {
    expect(
      parseBrief(['## Formula for the next 7 days', '- **Best slot:** , —'].join('\n')),
    ).toEqual([]);
  });

  it('keeps a bullet that has no label at all', () => {
    const out = parseBrief("## What's working\n- Just a plain sentence.");
    expect(out[0].items[0]).toEqual({ label: null, detail: 'Just a plain sentence.' });
  });

  it('returns nothing when every section is empty', () => {
    const allEmpty = "## What's working\n—\n\n## Topics to drop\n—";
    expect(parseBrief(allEmpty)).toEqual([]);
  });

  it('keeps an unrecognised section rather than silently dropping it', () => {
    const out = parseBrief('## Something new\n- **A** – b');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Something new');
    expect(out[0].tone).toBe('neutral');
  });
});
