import { describe, it, expect } from 'vitest';
import { buildAutopilotSteering } from '../autopilot-steering';

// The autopilot generation path (god-mode) shipped without ANY of the variety
// machinery the manual /api/captions path uses, and without the pain-point
// research. Audited 2026-08-03: god-mode imported neither hook-shape.ts nor
// pain-points.ts, so the rail that posts unattended every other day was the one
// rail with no steering at all.

describe('buildAutopilotSteering — hook shape variety', () => {
  it('steers towards a shape the account has under-used', () => {
    const steering = buildAutopilotSteering({
      recentHooks: [
        'Your pace is hiding something',
        'Your training is stalling',
        'Your recovery is the problem',
      ],
      painBrief: null,
    });
    // All three are flat declaratives, so anything but 'statement' is progress.
    expect(steering.targetPattern).not.toBe('statement');
    expect(steering.varietyDirective).toContain('HOOK SHAPE FOR THIS POST');
  });

  it('never targets the shape of the hook just published', () => {
    const steering = buildAutopilotSteering({
      // Newest first: a question was just used, and questions are otherwise rare.
      recentHooks: [
        'What is your real finish time?',
        'Your pace is hiding something',
        'Your training is stalling',
        'I stopped chasing splits',
        'I never trusted my watch',
        '3 things about your taper',
      ],
      painBrief: null,
    });
    expect(steering.targetPattern).not.toBe('question');
  });

  it('ignores blank hooks instead of counting them as a shape', () => {
    // Legacy/failed rows carry empty hookText. Classifying those yields
    // 'unknown', which is not a real shape and must not skew the counts.
    const withBlanks = buildAutopilotSteering({
      recentHooks: ['', '   ', 'Your pace is hiding something'],
      painBrief: null,
    });
    const withoutBlanks = buildAutopilotSteering({
      recentHooks: ['Your pace is hiding something'],
      painBrief: null,
    });
    expect(withBlanks.targetPattern).toBe(withoutBlanks.targetPattern);
  });

  it('still steers a brand with no history at all', () => {
    // A new brand should get variety from its first post, not once it has
    // already published a run of identical shapes.
    const steering = buildAutopilotSteering({ recentHooks: [], painBrief: null });
    expect(steering.targetPattern).not.toBeNull();
    expect(steering.varietyDirective).toContain('HOOK SHAPE FOR THIS POST');
  });
});

describe('buildAutopilotSteering — pain research', () => {
  const PAIN = 'AUDIENCE PAIN POINTS\n- plateau after 6 months (14 mentions)';

  it('carries the pain brief through when present', () => {
    const steering = buildAutopilotSteering({ recentHooks: [], painBrief: PAIN });
    expect(steering.painBlock).toContain('plateau after 6 months');
  });

  it('omits the pain block entirely when there is no research yet', () => {
    expect(buildAutopilotSteering({ recentHooks: [], painBrief: null }).painBlock).toBeNull();
    expect(buildAutopilotSteering({ recentHooks: [], painBrief: '   ' }).painBlock).toBeNull();
  });

  it('puts pain before variety in the prompt blocks', () => {
    // The pain is what the reader already feels; the shape is only how it gets
    // said. Ordering mirrors ad-copy.ts, which leads with pain for that reason.
    const steering = buildAutopilotSteering({
      recentHooks: ['Your pace is hiding something'],
      painBrief: PAIN,
    });
    expect(steering.blocks).toHaveLength(2);
    expect(steering.blocks[0]).toContain('plateau after 6 months');
    expect(steering.blocks[1]).toContain('HOOK SHAPE FOR THIS POST');
  });

  it('returns only the variety block when research has never run', () => {
    const steering = buildAutopilotSteering({ recentHooks: [], painBrief: null });
    expect(steering.blocks).toHaveLength(1);
    expect(steering.blocks[0]).toContain('HOOK SHAPE FOR THIS POST');
  });
});
