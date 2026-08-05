import { describe, it, expect } from 'vitest';
import { renderAnswerRow, describeChange, formatDay } from '../answer-render';

describe('describeChange', () => {
  it('says nothing when there is no baseline to compare against', () => {
    expect(describeChange(10, 0)).toBe('');
  });

  it('calls small movements about the same', () => {
    expect(describeChange(105, 100)).toBe('about the same');
  });

  it('reports rises and falls as percentages', () => {
    expect(describeChange(160, 100)).toBe('up 60%');
    expect(describeChange(75, 100)).toBe('down 25%');
  });
});

describe('formatDay', () => {
  it('returns an empty string for missing or unparseable dates', () => {
    expect(formatDay(null)).toBe('');
    expect(formatDay('not a date')).toBe('');
  });

  it('formats an ISO string as a readable day', () => {
    expect(formatDay('2026-08-05T03:00:00.000Z')).toContain('Aug');
    expect(formatDay('2026-08-05T03:00:00.000Z')).toContain('2026');
  });
});

describe('renderAnswerRow', () => {
  it('carries the brand through as the heading', () => {
    const out = renderAnswerRow('reach_trend', { brand: 'pacebrain', latest: 1, posts: 1 });
    expect(out.heading).toBe('pacebrain');
  });

  it('describes a reach trend in sentences, not numbers alone', () => {
    const out = renderAnswerRow('reach_trend', {
      brand: 'pacebrain', posts: 10, avgReach: 9, avgViews: 20, latest: 28, previousAverage: 7,
    });
    expect(out.sentences[0]).toBe('Your most recent post reached 28 people.');
    expect(out.sentences[1]).toContain('9 posts before it averaged 7');
    expect(out.sentences[1]).toContain('up 300%');
    expect(out.sentences[2]).toContain('averaged 9 people reached and 20 views');
    expect(out.tables).toEqual([]);
  });

  it('says "1 person" rather than "1 people"', () => {
    const out = renderAnswerRow('reach_trend', { brand: 'b', posts: 1, latest: 1 });
    expect(out.sentences[0]).toBe('Your most recent post reached 1 person.');
  });

  it('flags a leading hook shape that too few posts support', () => {
    const out = renderAnswerRow('top_hook_patterns', {
      brand: 'b',
      byHookShape: [{ value: 'your_x_is_y', samples: 2, meanScore: 0.8, confident: false }],
      byAngle: [],
    });
    expect(out.sentences[0]).toContain('only 2 posts back it');
    expect(out.sentences[0]).toContain('a hint, not a rule');
    expect(out.tables[0].columns).toEqual(['Hook shape', 'Posts', 'Score', 'Trustworthy yet']);
    expect(out.tables[0].rows[0]).toEqual(['your x is y', '2', '0.80', 'Too few posts']);
  });

  it('states plainly when nothing has enough results to compare', () => {
    const out = renderAnswerRow('top_hook_patterns', { brand: 'b', byHookShape: [], byAngle: [] });
    expect(out.sentences[0]).toContain('enough recorded results');
    expect(out.tables).toEqual([]);
  });

  it('tabulates failed posts with a reason column', () => {
    const out = renderAnswerRow('failed_posts', {
      brand: 'b',
      failed: [{ at: '2026-08-01T00:00:00Z', hook: 'Your pace is lying', reason: 'lost authorization' }],
    });
    expect(out.sentences[0]).toBe('1 post failed to publish.');
    expect(out.tables[0].rows[0][1]).toBe('Your pace is lying');
    expect(out.tables[0].rows[0][2]).toBe('lost authorization');
  });

  it('fills in placeholders rather than blanks for a failure with no detail', () => {
    const out = renderAnswerRow('failed_posts', { brand: 'b', failed: [{}] });
    expect(out.tables[0].rows[0]).toEqual(['Unknown', 'No hook', 'No reason recorded']);
  });

  it('counts ads by status and keeps the spend caveat', () => {
    const out = renderAnswerRow('ad_spend', {
      brand: 'b', totalAds: 11, active: 0, paused: 11, failed: 0,
      note: 'Spend appears once an ad has delivered; none have yet.',
    });
    expect(out.sentences[0]).toBe('You have 11 ads: 0 running, 11 paused, 0 failed.');
    expect(out.sentences[1]).toContain('none have yet');
  });

  it('leads pain points with the most mentioned theme', () => {
    const out = renderAnswerRow('pain_points', {
      brand: 'b',
      researchedAt: '2026-08-02T00:00:00Z',
      trusted: [{ theme: 'pacing', mentions: 12, quote: 'I always go out too fast' }],
      alsoSeen: ['fuelling', 'sleep'],
    });
    expect(out.sentences[0]).toContain('Researched');
    expect(out.sentences[1]).toBe('The problem people raise most is pacing, mentioned 12 times.');
    expect(out.sentences[2]).toBe('Also seen, but less often: fuelling, sleep.');
    expect(out.tables[0].rows[0][2]).toBe('I always go out too fast');
  });

  it('does not invent a pattern when nothing is trusted yet', () => {
    const out = renderAnswerRow('pain_points', { brand: 'b', trusted: [], alsoSeen: [] });
    expect(out.sentences[0]).toContain('Nothing has been mentioned often enough');
    expect(out.tables).toEqual([]);
  });

  it('explains the autopilot schedule and surfaces its last error', () => {
    const out = renderAnswerRow('posting_cadence', {
      brand: 'b', enabled: true, frequency: 'daily', published: 65,
      lastRunAt: '2026-08-05T03:00:00Z', nextRunAt: '2026-08-06T03:00:00Z',
      lastError: 'Session has expired',
    });
    expect(out.sentences[0]).toBe('Autopilot is on and set to post daily.');
    expect(out.sentences[1]).toBe('65 posts published so far.');
    expect(out.sentences[2]).toContain('last ran on');
    expect(out.sentences[3]).toContain('Session has expired');
  });

  it('says autopilot is off when it is off', () => {
    const out = renderAnswerRow('posting_cadence', {
      brand: 'b', enabled: false, frequency: 'daily', published: 0,
    });
    expect(out.sentences[0]).toContain('Autopilot is off');
  });

  it('falls back to a labelled table for an unknown question', () => {
    const out = renderAnswerRow('something_new', { brand: 'b', avgReach: 12, note: 'hi' });
    expect(out.sentences).toEqual([]);
    expect(out.tables[0].columns).toEqual(['Detail', 'Value']);
    expect(out.tables[0].rows).toEqual([
      ['Avg Reach', '12'],
      ['Note', 'hi'],
    ]);
  });

  it('degrades gracefully when a field has the wrong type', () => {
    // The safe readers coerce rather than throw, so a malformed row still
    // renders as the honest "nothing yet" answer instead of crashing the panel.
    const out = renderAnswerRow('pain_points', { brand: 'b', trusted: 'not an array' });
    expect(out.sentences[0]).toContain('Nothing has been mentioned often enough');
    expect(out.tables).toEqual([]);
  });

  it('never returns raw JSON for any known question', () => {
    const shapes: Array<[string, Record<string, unknown>]> = [
      ['reach_trend', { brand: 'b', posts: 3, latest: 5, previousAverage: 4 }],
      ['top_hook_patterns', { brand: 'b', byHookShape: [], byAngle: [] }],
      ['failed_posts', { brand: 'b', failed: [] }],
      ['ad_spend', { brand: 'b', totalAds: 1, active: 1, paused: 0, failed: 0 }],
      ['pain_points', { brand: 'b', trusted: [], alsoSeen: [] }],
      ['posting_cadence', { brand: 'b', enabled: true, frequency: 'daily', published: 1 }],
    ];
    for (const [id, row] of shapes) {
      const out = renderAnswerRow(id, row);
      expect(out.sentences.length, id).toBeGreaterThan(0);
      expect(out.sentences.join(' '), id).not.toContain('{');
    }
  });
});
