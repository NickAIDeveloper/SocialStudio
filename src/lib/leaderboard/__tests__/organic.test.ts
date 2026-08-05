import { describe, it, expect } from 'vitest';
import { rankOrganicPosts, buildVerdict, type LeaderboardPostInput } from '../organic';

function post(over: Partial<LeaderboardPostInput> = {}): LeaderboardPostInput {
  return {
    postId: 'p1',
    caption: 'A caption line\nsecond line',
    hookText: 'Your pace is hiding',
    angle: null,
    imageUrl: null,
    publishedAt: '2026-07-01T00:00:00.000Z',
    reach: 100,
    likes: 10,
    ...over,
  };
}

describe('rankOrganicPosts', () => {
  it('ranks by reach descending and numbers the rows from 1', () => {
    const rows = rankOrganicPosts([
      post({ postId: 'a', reach: 50 }),
      post({ postId: 'b', reach: 500 }),
      post({ postId: 'c', reach: 200 }),
    ]);
    expect(rows.map((r) => r.postId)).toEqual(['b', 'c', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks reach ties with likes', () => {
    const rows = rankOrganicPosts([
      post({ postId: 'a', reach: 100, likes: 2 }),
      post({ postId: 'b', reach: 100, likes: 9 }),
    ]);
    expect(rows.map((r) => r.postId)).toEqual(['b', 'a']);
  });

  it('uses the first line of the caption as the headline', () => {
    const [row] = rankOrganicPosts([post({ caption: 'First line\nSecond line' })]);
    expect(row.headline).toBe('First line');
  });

  it('falls back to the hook, then to a placeholder, when there is no caption', () => {
    expect(rankOrganicPosts([post({ caption: '  ', hookText: 'Hooky' })])[0].headline).toBe('Hooky');
    expect(rankOrganicPosts([post({ caption: null, hookText: null })])[0].headline).toBe(
      'Untitled post',
    );
  });

  it('computes engagement rate as likes per person reached', () => {
    const [row] = rankOrganicPosts([post({ reach: 200, likes: 10 })]);
    expect(row.engagementRate).toBeCloseTo(0.05);
  });

  it('leaves engagement rate null when nobody was reached', () => {
    const [row] = rankOrganicPosts([post({ reach: 0, likes: 3 })]);
    expect(row.engagementRate).toBeNull();
  });

  it('drops posts that were never measured, but keeps posts measured at zero', () => {
    // reach null = no analytics row written yet. reach 0 = we asked, nobody saw it.
    const rows = rankOrganicPosts([
      post({ postId: 'unmeasured', reach: null }),
      post({ postId: 'measured-zero', reach: 0 }),
    ]);
    expect(rows.map((r) => r.postId)).toEqual(['measured-zero']);
  });

  it('treats a null like count on a measured post as zero', () => {
    const [row] = rankOrganicPosts([post({ reach: 10, likes: null })]);
    expect(row.likes).toBe(0);
  });

  it('does not let unmeasured posts deflate the typical-post baseline', () => {
    const measured = Array.from({ length: 5 }, (_, i) =>
      post({ postId: `m${i}`, reach: 100, angle: null, hookText: null }),
    );
    const withGhosts = [
      ...measured,
      ...Array.from({ length: 5 }, (_, i) =>
        post({ postId: `g${i}`, reach: null, angle: null, hookText: null }),
      ),
      post({ postId: 'best', reach: 200, angle: null, hookText: null }),
    ];
    // Median stays 100 either way; if ghosts counted as 0 it would halve and
    // the headline multiplier would roughly double.
    expect(buildVerdict(rankOrganicPosts(withGhosts))).toBe(
      buildVerdict(rankOrganicPosts([...measured, post({ postId: 'best', reach: 200, angle: null, hookText: null })])),
    );
  });

  it('never infers an angle from a hook that matches no rule', () => {
    // 'curiosity' is both a real angle and classifyHookAngle's catch-all, so an
    // unreadable hook must produce NO tag rather than a curiosity gap.
    const [row] = rankOrganicPosts([post({ angle: null, hookText: 'Mile eighteen legs gone' })]);
    expect(row.angleId).toBeNull();
  });

  it('still honours curiosity when it was explicitly recorded', () => {
    const [row] = rankOrganicPosts([post({ angle: 'curiosity', hookText: 'anything' })]);
    expect(row.angleId).toBe('curiosity');
    expect(row.angleLabel).toBe('Curiosity gap');
  });

  it('prefers the recorded angle over inferring one from the hook', () => {
    const [row] = rankOrganicPosts([post({ angle: 'story', hookText: 'Is this working?' })]);
    expect(row.angleId).toBe('story');
    expect(row.angleLabel).toBe('Story');
  });

  it('infers the angle from the hook when the column is empty', () => {
    const [row] = rankOrganicPosts([post({ angle: null, hookText: 'Is this working?' })]);
    expect(row.angleId).toBe('question');
  });

  it('reports no angle at all when there is nothing to infer from', () => {
    const [row] = rankOrganicPosts([post({ angle: null, hookText: '  ' })]);
    expect(row.angleId).toBeNull();
    expect(row.angleLabel).toBeNull();
  });

  it('ignores an unrecognised angle value and falls back to inference', () => {
    const [row] = rankOrganicPosts([post({ angle: 'bogus', hookText: 'Stop chasing splits' })]);
    expect(row.angleId).toBe('command');
  });
});

describe('buildVerdict', () => {
  const many = (n: number, over: (i: number) => Partial<LeaderboardPostInput>) =>
    rankOrganicPosts(Array.from({ length: n }, (_, i) => post({ postId: `p${i}`, ...over(i) })));

  it('returns null when there is nothing to judge', () => {
    expect(buildVerdict([])).toBeNull();
  });

  it('names the angle that genuinely out-reaches the others', () => {
    const rows = many(10, (i) => ({
      reach: i < 5 ? 1000 : 100,
      angle: i < 5 ? 'question' : 'stat',
    }));
    const verdict = buildVerdict(rows);
    expect(verdict).toContain('Posts that open with a question reach 1,000 people');
    expect(verdict).toContain('against 100 for the rest');
    expect(verdict).toContain('Do more of those');
  });

  it('needs five posts behind an angle before recommending it', () => {
    // Four winners is a streak, not a finding.
    const rows = many(10, (i) => ({
      reach: i < 4 ? 1000 : 100,
      angle: i < 4 ? 'question' : 'stat',
    }));
    expect(buildVerdict(rows)).not.toContain('Do more of those');
  });

  it('does NOT crown the most COMMON angle when it does not out-reach the rest', () => {
    // The real shape of this account: the collapsed "Your X is lying" hooks all
    // classify as `myth` and dominate by count while performing no better.
    const rows = many(20, (i) => ({
      reach: 100,
      angle: i < 14 ? 'myth' : 'question',
    }));
    expect(buildVerdict(rows)).not.toContain('Do more of those');
  });

  it('stays silent on angles when only one angle has enough posts', () => {
    const rows = many(10, (i) => ({
      reach: i < 2 ? 5000 : 100,
      angle: i < 2 ? 'question' : 'myth',
      hookText: null,
    }));
    // Only 'myth' clears the five-post bar, so there is nothing to compare to.
    expect(buildVerdict(rows)).not.toContain('Do more of those');
  });

  it('compares angle MEANS, not totals', () => {
    // 5 question posts at 1000 vs 10 stat posts at 600: mean picks question,
    // summed reach would pick stat. Stops "mean" being quietly rewritten.
    const rows = many(15, (i) => ({
      reach: i < 5 ? 1000 : 600,
      angle: i < 5 ? 'question' : 'stat',
    }));
    expect(buildVerdict(rows)).toContain('Posts that open with a question');
  });

  it('stays silent when too few of the posts carry any angle at all', () => {
    // 4 of 10 tagged is below MIN_ANGLE_COVERAGE even though both angles clear
    // the 5-post bar individually... they cannot, so use enough rows to isolate
    // the coverage gate: 20 rows, 8 tagged (0.4), 4 per angle.
    const under = many(20, (i) => ({
      reach: i < 4 ? 1000 : 100,
      angle: i < 4 ? 'question' : i < 8 ? 'stat' : null,
      hookText: null,
    }));
    expect(buildVerdict(under)).not.toContain('Do more of those');

    // Same shape, but 12 of 20 tagged (0.6) with 6 per angle: coverage and the
    // per-angle bar are both cleared, so a winner can be named.
    const over = many(20, (i) => ({
      reach: i < 6 ? 1000 : 100,
      angle: i < 6 ? 'question' : i < 12 ? 'stat' : null,
      hookText: null,
    }));
    expect(buildVerdict(over)).toContain('Do more of those');
  });

  it('formats the reach total with thousands separators', () => {
    const rows = many(10, () => ({ reach: 1240, angle: 'question' }));
    expect(buildVerdict(rows)).toContain('12,400 people');
  });

  it('falls back to a spread sentence when too few posts carry an angle', () => {
    const rows = many(10, (i) => ({
      reach: i === 0 ? 900 : 100,
      angle: i === 0 ? 'question' : null,
      hookText: null,
    }));
    const verdict = buildVerdict(rows);
    expect(verdict).toContain('9.0x more people');
  });

  it('falls back again when the spread is not worth reporting', () => {
    const rows = many(4, () => ({ reach: 100, angle: null, hookText: null }));
    const verdict = buildVerdict(rows);
    expect(verdict).toBe('Your top 4 posts reached 400 people.');
  });

  it('never claims a winner off a single tagged post', () => {
    const rows = many(10, (i) => ({ reach: 100, angle: i === 0 ? 'question' : null, hookText: null }));
    expect(buildVerdict(rows)).not.toContain('Posts that open with');
  });

  it('contains no dashes', () => {
    const rows = many(10, (i) => ({ reach: i < 5 ? 1000 : 100, angle: i < 5 ? 'question' : 'stat' }));
    expect(buildVerdict(rows)).not.toMatch(/[-—–]/);
  });
});
