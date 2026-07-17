import { describe, it, expect } from 'vitest';
import {
  CREATIVE_ANGLES,
  ANGLE_IDS,
  pickLruAngle,
  buildCreativeBrief,
  getAngle,
  aggregateAngleScores,
  type AngleId,
} from '../creative-angles';
import { classifyHookAngle } from '../hook-variety';

describe('CREATIVE_ANGLES palette', () => {
  it('has unique ids and non-empty guidance', () => {
    expect(new Set(ANGLE_IDS).size).toBe(CREATIVE_ANGLES.length);
    for (const a of CREATIVE_ANGLES) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hookGuidance.length).toBeGreaterThan(0);
      expect(a.captionGuidance.length).toBeGreaterThan(0);
    }
  });

  it('keeps contrarian LAST so LRU reaches the fatigued shape only after fresher ones', () => {
    expect(CREATIVE_ANGLES[CREATIVE_ANGLES.length - 1].id).toBe('contrarian');
  });
});

describe('pickLruAngle', () => {
  it('prefers an angle never used recently over a recent one', () => {
    const recent: AngleId[] = ['myth', 'myth', 'myth'];
    const chosen = pickLruAngle(recent, 0);
    expect(chosen.id).not.toBe('myth');
  });

  it('is deterministic for the same inputs', () => {
    const recent: AngleId[] = ['myth', 'question'];
    expect(pickLruAngle(recent, 7).id).toBe(pickLruAngle(recent, 7).id);
  });

  it('breaks ties across seeds (spreads the palette on a cold start)', () => {
    const ids = new Set<AngleId>();
    for (let seed = 0; seed < CREATIVE_ANGLES.length; seed++) {
      ids.add(pickLruAngle([], seed).id);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('picks the most-stale angle when all have been used', () => {
    // Newest-first: 'question' used most recently (index 0), 'stat' least (index 9).
    const recent: AngleId[] = ['question', 'story', 'myth', 'command', 'confession', 'howto', 'curiosity', 'metaphor', 'contrarian', 'stat'];
    expect(pickLruAngle(recent, 0).id).toBe('stat');
  });

  it('ignores null/unknown recent angles', () => {
    const chosen = pickLruAngle([null, undefined, 'myth'], 0);
    expect(chosen.id).not.toBe('myth');
  });

  it('rotates through many distinct angles over a rolling window (no collapse)', () => {
    // Simulate 12 sequential generations: each pick is fed back as the newest
    // recent angle. The rotation must NOT collapse onto one shape.
    const window: AngleId[] = [];
    const picked: AngleId[] = [];
    for (let i = 0; i < 12; i++) {
      const a = pickLruAngle(window, i);
      picked.push(a.id);
      window.unshift(a.id); // newest first
    }
    expect(new Set(picked).size).toBeGreaterThanOrEqual(8);
  });
});

describe('buildCreativeBrief', () => {
  it('carries winning techniques but never a literal line, and bans the collapsed skeleton', () => {
    const brief = buildCreativeBrief({
      angle: getAngle('question'),
      winningTechniques: ['direct second-person "you" address', 'a contrarian reframe'],
      bannedSkeletonHuman: 'your ___ is ___',
    });
    expect(brief).toContain('Provocative question');
    expect(brief).toContain('direct second-person');
    expect(brief).toContain('your ___ is ___');
    // The forced-echo instruction that caused the collapse must be gone.
    expect(brief).not.toContain('MUST echo');
    expect(brief).not.toContain('same sentence shape');
    // The angle must be declared authoritative over any conflicting content-type
    // hook style (e.g. the 'quote' type's hardcoded "truth bomb").
    expect(brief).toContain('ANGLE governs the hook');
  });

  it('omits the ban line when there is no dominant skeleton', () => {
    const brief = buildCreativeBrief({ angle: getAngle('story'), winningTechniques: [] });
    expect(brief).not.toContain('BANNED SHAPE');
  });
});

// Variety assertion (spec §6): across a rolling 10-post rotation the collapsed
// "Your X is Y" shape (the `myth` angle) must appear at most twice — no more
// "Your pace is hiding" wall.
describe('variety guarantee', () => {
  it('the collapsed myth shape appears ≤2 times over 10 rotated posts', () => {
    const window: AngleId[] = [];
    const picked: AngleId[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = pickLruAngle(window, i);
      picked.push(angle.id);
      window.unshift(angle.id);
    }
    const mythCount = picked.filter((id) => id === 'myth').length;
    expect(mythCount).toBeLessThanOrEqual(2);
    // And the run is genuinely diverse, not two shapes ping-ponging.
    expect(new Set(picked).size).toBeGreaterThanOrEqual(8);
  });

  it('classifyHookAngle round-trips the collapsed family to myth (feeds the rotation)', () => {
    expect(classifyHookAngle('Your pace is hiding')).toBe('myth');
  });
});

describe('aggregateAngleScores', () => {
  it('averages reach + weighted saves per angle, ignoring unknown/null angles', () => {
    const scores = aggregateAngleScores([
      { angle: 'question', reach: 100, saves: 0 },
      { angle: 'question', reach: 300, saves: 0 }, // avg 200
      { angle: 'story', reach: 100, saves: 5 },    // 100 + 20*5 = 200
      { angle: null, reach: 9999, saves: 9999 },   // ignored
      { angle: 'not-an-angle', reach: 9999, saves: 0 }, // ignored
    ]);
    expect(scores.question).toBe(200);
    expect(scores.story).toBe(200);
    // null-angle and unknown-angle rows are ignored: only real angles are keys.
    expect(Object.keys(scores).sort()).toEqual(['question', 'story']);
  });

  it('is empty when there is no data (loop is a no-op until postAnalytics fills)', () => {
    expect(aggregateAngleScores([])).toEqual({});
  });
});

describe('pickLruAngle with performance scores', () => {
  it('breaks a tie among equally-stale angles toward the higher performer', () => {
    // Cold start: all angles equally stale. Give one a real score.
    const chosen = pickLruAngle([], 0, { scores: { metaphor: 5000 } });
    expect(chosen.id).toBe('metaphor');
  });

  it('never re-picks a recently-used angle even if it scored highest (variety wins)', () => {
    // 'metaphor' is the most recent (index 0) => not a stale candidate, so its
    // huge score cannot bring it back. LRU dominates.
    const recent: AngleId[] = ['metaphor'];
    const chosen = pickLruAngle(recent, 0, { scores: { metaphor: 999999 } });
    expect(chosen.id).not.toBe('metaphor');
  });

  it('falls back to the seed tie-break when no candidate has a positive score', () => {
    const withScores = pickLruAngle([], 3, { scores: { question: 0 } });
    const without = pickLruAngle([], 3);
    expect(withScores.id).toBe(without.id);
  });
});
