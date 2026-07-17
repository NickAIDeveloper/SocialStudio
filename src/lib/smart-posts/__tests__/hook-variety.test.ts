import { describe, it, expect } from 'vitest';
import {
  hookSkeleton,
  skeletonToHuman,
  hookMatchesSkeleton,
  dominantHookSkeleton,
  classifyHookAngle,
  hookTechniques,
} from '../hook-variety';

// The exact production collapse: the whole PaceBrain family must reduce to one
// skeleton so it can be detected and banned.
const PACEBRAIN_COLLAPSE = [
  'Your pace is hiding',
  'Your pace is lying',
  'Your pace is hidden',
  'Your race plan is wrong',
  'Your race plan is lying',
  'Your pacing myth is false',
];

describe('hookSkeleton', () => {
  it('collapses the whole "Your X is Y" family to one skeleton', () => {
    const skeletons = new Set(PACEBRAIN_COLLAPSE.map(hookSkeleton));
    expect(skeletons.size).toBe(1);
    expect([...skeletons][0]).toBe('your * is *');
  });

  it('gives genuinely different hooks different skeletons', () => {
    expect(hookSkeleton('Stop chasing splits')).toBe('*');
    expect(hookSkeleton('Nobody talks about this')).toBe('* this');
    expect(hookSkeleton('3 fixes for dead legs')).toBe('* for *');
    expect(hookSkeleton('Your pace is hiding')).not.toBe(hookSkeleton('Stop chasing splits'));
  });

  it('returns empty string for non-alphanumeric / empty input', () => {
    expect(hookSkeleton('')).toBe('');
    expect(hookSkeleton('   ')).toBe('');
    expect(hookSkeleton(null)).toBe('');
    expect(hookSkeleton('🔥🔥')).toBe('');
  });
});

describe('skeletonToHuman', () => {
  it('renders wildcards as blanks', () => {
    expect(skeletonToHuman('your * is *')).toBe('your ___ is ___');
  });
});

describe('hookMatchesSkeleton', () => {
  it('matches a hook against a collapse skeleton', () => {
    expect(hookMatchesSkeleton('Your legs are lying', 'your * is *')).toBe(false); // "are", not "is"
    expect(hookMatchesSkeleton('Your form is broken', 'your * is *')).toBe(true);
    expect(hookMatchesSkeleton('Stop overtraining', 'your * is *')).toBe(false);
  });

  it('never matches an empty skeleton', () => {
    expect(hookMatchesSkeleton('anything', '')).toBe(false);
    expect(hookMatchesSkeleton('anything', null)).toBe(false);
  });
});

describe('dominantHookSkeleton', () => {
  it('detects the collapsed shape', () => {
    expect(dominantHookSkeleton(PACEBRAIN_COLLAPSE)).toBe('your * is *');
  });

  it('returns null when hooks are varied', () => {
    const varied = [
      'Stop chasing splits',
      'What if your taper is wrong?',
      '3 fixes for dead legs',
      'Mile 18 broke me',
      'Nobody talks about this',
    ];
    expect(dominantHookSkeleton(varied)).toBeNull();
  });

  it('returns null below the minimum count', () => {
    expect(dominantHookSkeleton(['Your pace is hiding', 'Your form is off'])).toBeNull();
  });

  it('ignores empty/emoji hooks', () => {
    expect(dominantHookSkeleton(['', '🔥', null, undefined])).toBeNull();
  });

  it('excludes degenerate all-wildcard skeletons (punchy hooks are not a collapse)', () => {
    // "Stop chasing splits", "Ditch perfect form", "Mile 18 legs gone" all -> "*".
    // These are varied command/story hooks, not a repeated SHAPE — must not ban.
    expect(
      dominantHookSkeleton(['Stop chasing splits', 'Ditch perfect form', 'Mile 18 legs gone']),
    ).toBeNull();
  });

  it('still detects a structured collapse when punchy hooks are mixed in', () => {
    const mixed = [
      'Your pace is hiding',
      'Your form is broken',
      'Your race plan is wrong',
      'Stop chasing splits', // degenerate "*", excluded from the pool
    ];
    expect(dominantHookSkeleton(mixed)).toBe('your * is *');
  });

  it('counts exact repeats (raw list) so an 8x identical hook is caught', () => {
    const raw = Array.from({ length: 8 }, () => 'Your pace is hiding');
    expect(dominantHookSkeleton(raw)).toBe('your * is *');
  });
});

describe('classifyHookAngle', () => {
  it('maps the collapsed family to the myth angle (so LRU rotates away from it)', () => {
    for (const h of PACEBRAIN_COLLAPSE) {
      expect(classifyHookAngle(h)).toBe('myth');
    }
  });

  it('maps surface signals to their angles', () => {
    expect(classifyHookAngle('What if your taper is wrong?')).toBe('question');
    expect(classifyHookAngle('3 fixes for dead legs')).toBe('stat');
    expect(classifyHookAngle('Stop chasing splits')).toBe('command');
    expect(classifyHookAngle('I bonked at mile twenty')).toBe('confession');
    expect(classifyHookAngle('Training like a coin flip')).toBe('metaphor');
    expect(classifyHookAngle('The thing under your splits')).toBe('curiosity');
  });

  it('defaults empty input to curiosity', () => {
    expect(classifyHookAngle('')).toBe('curiosity');
    expect(classifyHookAngle(null)).toBe('curiosity');
  });
});

describe('hookTechniques', () => {
  it('extracts the transferable psychology of the winning hook (not its words)', () => {
    const techniques = hookTechniques('Your pace is hiding');
    expect(techniques).toContain('direct second-person "you" address');
    expect(techniques).toContain('a contrarian reframe that challenges a belief the reader holds');
    // Never leaks the literal line.
    expect(techniques.join(' ')).not.toContain('pace is hiding');
  });

  it('returns empty for empty input', () => {
    expect(hookTechniques('')).toEqual([]);
    expect(hookTechniques(null)).toEqual([]);
  });
});
