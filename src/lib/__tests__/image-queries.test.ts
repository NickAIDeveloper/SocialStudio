import { describe, it, expect } from 'vitest';
import { sanitizeImageQueries } from '@/lib/image-queries';

const ctx = {
  contextTexts: [
    'Your brain is working against you, often sabotaging your learning and study habits',
    'affectly',
    'promo',
  ],
};

describe('sanitizeImageQueries', () => {
  it('parses standard JSON shape', () => {
    const raw = '{"queries":["student studying notes","brain learning concept","focused study desk","frustrated student working","study habits journal"]}';
    const out = sanitizeImageQueries(raw, ctx);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0]).toMatch(/study|student|brain|learning/);
  });

  it('drops stock-photo cliches but keeps topical words', () => {
    const raw = '{"queries":["silhouette study sunset","contemplation reading desk","brain learning desk","study mindset session","focused study notes"]}';
    const out = sanitizeImageQueries(raw, ctx);
    for (const q of out) {
      expect(q).not.toMatch(/silhouette|contemplation/);
    }
    // Topical words like "mindset" survive when the query has context overlap
    expect(out.some(q => /mindset/.test(q))).toBe(true);
    expect(out.some(q => /brain learning/.test(q))).toBe(true);
  });

  it('drops queries with no context overlap', () => {
    const raw = '{"queries":["coins stacks money","skiing alpine snow","cooking pasta kitchen","student focused study","car racing track"]}';
    const out = sanitizeImageQueries(raw, ctx);
    expect(out).toContain('student focused study');
    expect(out).not.toContain('coins stacks money');
    expect(out).not.toContain('cooking pasta kitchen');
  });

  it('dedupes and clamps to max', () => {
    const raw = '{"queries":["student study notes","Student Study Notes","STUDENT STUDY NOTES","brain learning desk","focused student writing","study habits journal","learning focus deep"]}';
    const out = sanitizeImageQueries(raw, { ...ctx, max: 4 });
    expect(out.length).toBeLessThanOrEqual(4);
    expect(new Set(out).size).toBe(out.length);
  });

  it('strips hashtags and punctuation, lowercases', () => {
    const raw = '{"queries":["#StudentStudying notes!","Brain.Learning,Concept","focused study desk","Habits Journal Writing","study Routine Daily"]}';
    const out = sanitizeImageQueries(raw, ctx);
    for (const q of out) {
      expect(q).toBe(q.toLowerCase());
      expect(q).not.toMatch(/[#.,!?:;'"]/);
    }
  });

  it('rejects meta-leak words', () => {
    const raw = '{"queries":["return only json","caption study notes","student focused work","reply with query","brain learning"]}';
    const out = sanitizeImageQueries(raw, ctx);
    for (const q of out) {
      expect(q).not.toMatch(/\b(return|caption|reply|query|json)\b/);
    }
  });

  it('falls back to bracket extraction', () => {
    const raw = 'Here are the queries: ["student study notes","brain learning desk","focused work session"]';
    const out = sanitizeImageQueries(raw, ctx);
    expect(out.length).toBeGreaterThan(0);
  });

  it('returns empty when nothing parseable', () => {
    expect(sanitizeImageQueries('totally garbage output', ctx)).toEqual([]);
    expect(sanitizeImageQueries('', ctx)).toEqual([]);
  });

  it('skips queries that are too short or too long', () => {
    const raw = '{"queries":["go","a","student study notes desk learning materials extra extra extra extra extra long","focused student","brain learning desk"]}';
    const out = sanitizeImageQueries(raw, ctx);
    for (const q of out) {
      expect(q.length).toBeGreaterThanOrEqual(6);
      expect(q.length).toBeLessThanOrEqual(80);
    }
  });
});
