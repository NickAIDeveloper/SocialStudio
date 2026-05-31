import { describe, it, expect, beforeEach } from 'vitest';
import { listTemplates, saveTemplate, deleteTemplate, type AdTemplateConfig } from '../ad-templates';
import type { AdDraft, AdTargeting } from '@/lib/meta/ads-types';

const draft: AdDraft = {
  objective: 'TRAFFIC',
  destinationUrl: 'https://example.com/offer',
  primaryText: 'Buy now.',
  hook: 'Big sale',
  headline: 'Spring Sale',
  hashtags: ['#sale'],
  cta: 'LEARN_MORE',
  imageUrl: 'https://img/x.jpg',
  interestSuggestions: ['fitness'],
};

const targeting: AdTargeting = {
  countries: ['GB'], cities: [], ageMin: 18, ageMax: 65, gender: 'all',
  interests: ['fitness'], dailyBudgetMinor: 1000, startDate: '', endDate: '',
};

const config: AdTemplateConfig = {
  brandId: 'brand-1',
  objective: 'TRAFFIC',
  destinationUrl: 'https://example.com/offer',
  draft,
  targeting,
};

describe('ad-templates', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips: save → list → delete', () => {
    expect(listTemplates()).toEqual([]);

    const saved = saveTemplate('Spring sale', config);
    expect(saved.name).toBe('Spring sale');
    expect(saved.id).toContain('spring-sale');
    expect(saved.config.draft.headline).toBe('Spring Sale');

    const all = listTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(saved.id);
    expect(all[0].config.targeting.countries).toEqual(['GB']);

    deleteTemplate(saved.id);
    expect(listTemplates()).toEqual([]);
  });

  it('lists newest first', () => {
    const a = saveTemplate('A', config);
    const b = saveTemplate('B', { ...config, brandId: 'brand-2' });
    const list = listTemplates();
    // b saved last → first
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it('falls back to "Untitled ad" for blank names', () => {
    const saved = saveTemplate('   ', config);
    expect(saved.name).toBe('Untitled ad');
  });

  it('returns [] on corrupt JSON', () => {
    localStorage.setItem('goviraleza.adTemplates', '{not valid json');
    expect(listTemplates()).toEqual([]);
  });
});
