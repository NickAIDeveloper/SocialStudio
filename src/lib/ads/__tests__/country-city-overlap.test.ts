import { describe, it, expect } from 'vitest';
import { findCountryCityOverlap } from '../geo-overlap';

describe('findCountryCityOverlap', () => {
  it('finds a city sitting inside a country that is also targeted', () => {
    // The exact shape that made Meta reject six ads on this account.
    const clash = findCountryCityOverlap(['GB'], [{ key: '2643743', name: 'London', countryCode: 'GB' }]);
    expect(clash).toEqual({ city: 'London', countryCode: 'GB' });
  });

  it('is case insensitive about country codes', () => {
    expect(findCountryCityOverlap(['gb'], [{ key: '1', name: 'London', countryCode: 'GB' }])).not.toBeNull();
    expect(findCountryCityOverlap(['GB'], [{ key: '1', name: 'London', countryCode: 'gb' }])).not.toBeNull();
  });

  it('allows a city in a country that is NOT targeted', () => {
    // Targeting the US plus London is legitimate, not an overlap.
    expect(findCountryCityOverlap(['US'], [{ key: '1', name: 'London', countryCode: 'GB' }])).toBeNull();
  });

  it('allows countries with no cities and cities with no countries', () => {
    expect(findCountryCityOverlap(['GB'], [])).toBeNull();
    expect(findCountryCityOverlap([], [{ key: '1', name: 'London', countryCode: 'GB' }])).toBeNull();
  });

  it('lets a city through when its country is unknown', () => {
    // Drafts saved before country codes were captured must still publish.
    expect(findCountryCityOverlap(['GB'], [{ key: '1', name: 'London' }])).toBeNull();
  });

  it('reports the first clash when several cities overlap', () => {
    const clash = findCountryCityOverlap(['GB', 'US'], [
      { key: '1', name: 'Paris', countryCode: 'FR' },
      { key: '2', name: 'Leeds', countryCode: 'GB' },
      { key: '3', name: 'Austin', countryCode: 'US' },
    ]);
    expect(clash?.city).toBe('Leeds');
  });
});
