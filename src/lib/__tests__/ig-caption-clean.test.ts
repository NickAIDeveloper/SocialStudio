import { describe, it, expect } from 'vitest';
import { cleanIgCaption } from '../ig-caption-clean';

describe('cleanIgCaption', () => {
  it('strips "<handle> on <Month> <Day>, <Year>:" header', () => {
    const input = 'affectly.app on April 6, 2026: Train smarter today.';
    expect(cleanIgCaption(input)).toBe('Train smarter today.');
  });

  it('strips header with @ prefix', () => {
    const input = '@affectly.app on Apr 6, 2026: Train smarter.';
    expect(cleanIgCaption(input)).toBe('Train smarter.');
  });

  it('strips wrapping smart quotes after header strip', () => {
    const input = 'affectly.app on April 6, 2026: \u201CTrain smarter today.\u201D';
    expect(cleanIgCaption(input)).toBe('Train smarter today.');
  });

  it('strips wrapping straight quotes', () => {
    const input = '"Train smarter today."';
    expect(cleanIgCaption(input)).toBe('Train smarter today.');
  });

  it('handles full month names', () => {
    const input = 'somehandle on November 23, 2025: caption text';
    expect(cleanIgCaption(input)).toBe('caption text');
  });

  it('returns empty string for empty input', () => {
    expect(cleanIgCaption('')).toBe('');
  });

  it('leaves clean caption unchanged', () => {
    const input = 'A clean caption with no IG framing.';
    expect(cleanIgCaption(input)).toBe('A clean caption with no IG framing.');
  });

  it('does not strip body text that mentions a date', () => {
    const input = 'See you on April 6, 2026 at the launch event!';
    expect(cleanIgCaption(input)).toBe('See you on April 6, 2026 at the launch event!');
  });
});
