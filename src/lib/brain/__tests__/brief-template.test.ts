import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBrief, parseFormula } from '../brief-parser';

const validBrief = readFileSync(
  join(import.meta.dirname, 'fixtures', 'previous-brief.md'),
  'utf8'
);

describe('validateBrief', () => {
  it('accepts a brief with all required headers in order', () => {
    expect(validateBrief(validBrief).ok).toBe(true);
  });

  it('rejects a brief missing a header', () => {
    const broken = validBrief.replace('## Topics to drop', '');
    expect(validateBrief(broken).ok).toBe(false);
  });

  it('rejects a brief with headers out of order', () => {
    const swapped = validBrief.replace(
      /## What's working([\s\S]*?)## What's not working/,
      "## What's not working$1## What's working"
    );
    expect(validateBrief(swapped).ok).toBe(false);
  });
});

describe('parseFormula', () => {
  it('extracts format, slot, caption shape from a valid brief', () => {
    const formula = parseFormula(validBrief);
    expect(formula).not.toBeNull();
    expect(formula!.format).toBe('REEL');
    expect(formula!.bestSlot.dow).toBe(2);
    expect(formula!.bestSlot.hour).toBe(19);
    expect(formula!.captionShape.lines).toBe(12);
    expect(formula!.captionShape.paragraphs).toBe(4);
    expect(formula!.captionShape.emojiDensity).toBe('low');
  });

  it('returns null when Formula section is missing', () => {
    expect(parseFormula("## What's working\n- nothing")).toBeNull();
  });
});
