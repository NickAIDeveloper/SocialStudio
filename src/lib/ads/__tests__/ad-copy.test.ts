import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('@/lib/cerebras', () => ({
  cerebrasChatCompletion: chatMock,
  isCerebrasAvailable: () => true,
}));

import { generateAdCopy, type GenerateAdCopyInput } from '../ad-copy';

const baseInput: GenerateAdCopyInput = {
  brand: { name: 'PaceBrain', slug: 'pacebrain', description: 'AI running coach', websiteUrl: 'https://pacebrain.app' },
  objective: 'TRAFFIC',
  destinationUrl: 'https://pacebrain.app',
  briefMd: '# brief',
  competitorContext: 'Rivals all sell generic pace calculators.',
};

describe('generateAdCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the 4 copy fields with the right shapes', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({
        primaryText: 'Hook line.\n\nBody.\n\nCTA now.',
        hook: 'Stop scrolling now',
        headline: 'Run smarter today',
        hashtags: '#run #pace #fitness #training #goals',
      }),
    );

    const out = await generateAdCopy(baseInput);

    expect(typeof out.primaryText).toBe('string');
    expect(out.primaryText.length).toBeGreaterThan(0);
    expect(out.hook).toBe('Stop scrolling now');
    expect(out.headline.length).toBeLessThanOrEqual(40);
    expect(Array.isArray(out.hashtags)).toBe(true);
    expect(out.hashtags).toHaveLength(5);
    expect(out.hashtags).toContain('#run');
  });

  it('caps an over-long headline to <=40 chars on a word boundary', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({
        primaryText: 'Hook line.\n\nBody copy.\n\nClick now.',
        hook: 'Big claim here',
        headline: 'This headline is absurdly long and goes way beyond the meta forty character limit',
        hashtags: '#a #b #c #d #e',
      }),
    );

    const out = await generateAdCopy(baseInput);
    expect(out.headline.length).toBeLessThanOrEqual(40);
    expect(out.headline.endsWith(' ')).toBe(false);
  });

  it('parses JSON wrapped in markdown fences', async () => {
    chatMock.mockResolvedValue(
      '```json\n{"primaryText":"A.\\n\\nB.","hook":"Hooky","headline":"Short","hashtags":"#x #y"}\n```',
    );
    const out = await generateAdCopy(baseInput);
    expect(out.primaryText.length).toBeGreaterThan(0);
    expect(out.hashtags).toEqual(['#x', '#y']);
  });

  it('dedupes and lowercases hashtags, capping at 5', async () => {
    chatMock.mockResolvedValue(
      JSON.stringify({
        primaryText: 'A.\n\nB.',
        hook: 'Hook',
        headline: 'Head',
        hashtags: '#Run #run #PACE #fit #goals #extra #more',
      }),
    );
    const out = await generateAdCopy(baseInput);
    expect(out.hashtags).toHaveLength(5);
    expect(out.hashtags).toContain('#run');
    expect(out.hashtags.filter((t) => t === '#run')).toHaveLength(1);
  });

  it('throws when the model returns non-JSON garbage', async () => {
    chatMock.mockResolvedValue('I cannot help with that. No JSON here at all.');
    await expect(generateAdCopy(baseInput)).rejects.toThrow();
  });
});
