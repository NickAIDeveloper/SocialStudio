import { describe, it, expect } from 'vitest';
import {
  encodeLearnings,
  decodeLearnings,
  filterInsightsByLearnings,
} from '../learnings';
import type { InsightCard } from '@/lib/health-score';

const insight = (id: string, type: string): InsightCard => ({
  id,
  type,
  priority: 1,
  icon: '⚡',
  title: id,
  verdict: 'positive',
  summary: '',
  action: '',
  data: {},
});

describe('encodeLearnings', () => {
  it('returns empty string for empty input', () => {
    expect(encodeLearnings([])).toBe('');
  });

  it('joins ids with commas in insertion order', () => {
    expect(encodeLearnings(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('deduplicates and trims', () => {
    expect(encodeLearnings(['a', 'b', 'a', '  c ', ''])).toBe('a,b,c');
  });

  it('URL-encodes ids that contain commas or whitespace', () => {
    expect(encodeLearnings(['a,b', 'c d'])).toBe('a%2Cb,c%20d');
  });
});

describe('decodeLearnings', () => {
  it('returns empty array for null or empty string', () => {
    expect(decodeLearnings(null)).toEqual([]);
    expect(decodeLearnings('')).toEqual([]);
  });

  it('splits on comma and trims', () => {
    expect(decodeLearnings(' a , b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('decodes URL-encoded ids', () => {
    expect(decodeLearnings('a%2Cb,c%20d')).toEqual(['a,b', 'c d']);
  });

  it('drops empty entries', () => {
    expect(decodeLearnings('a,,b,')).toEqual(['a', 'b']);
  });

  it('round-trips with encodeLearnings', () => {
    const ids = ['best-content-type', 'optimal-timing', 'caption,with-comma'];
    expect(decodeLearnings(encodeLearnings(ids))).toEqual(ids);
  });
});

describe('filterInsightsByLearnings', () => {
  const insights = [insight('i1', 'a'), insight('i2', 'b'), insight('i3', 'c')];

  it('returns all insights when ids is empty', () => {
    expect(filterInsightsByLearnings(insights, [])).toEqual(insights);
  });

  it('returns only matching insights when ids is non-empty', () => {
    const filtered = filterInsightsByLearnings(insights, ['i1', 'i3']);
    expect(filtered.map((i) => i.id)).toEqual(['i1', 'i3']);
  });

  it('preserves the original order, not the ids order', () => {
    const filtered = filterInsightsByLearnings(insights, ['i3', 'i1']);
    expect(filtered.map((i) => i.id)).toEqual(['i1', 'i3']);
  });

  it('ignores ids that do not match any insight', () => {
    const filtered = filterInsightsByLearnings(insights, ['i1', 'nope']);
    expect(filtered.map((i) => i.id)).toEqual(['i1']);
  });
});
