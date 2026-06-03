import { describe, it, expect } from 'vitest';
import { citiesOverlap, findOverlap, type GeoCity } from '../geo-overlap';

const melbourne: GeoCity = { key: '1', name: 'Melbourne', lat: -37.8136, lng: 144.9631, radius: 10, distanceUnit: 'mile' };
const richmond: GeoCity = { key: '2', name: 'Richmond', lat: -37.8233, lng: 144.9980, radius: 10, distanceUnit: 'mile' };
const sydney: GeoCity = { key: '3', name: 'Sydney', lat: -33.8688, lng: 151.2093, radius: 10, distanceUnit: 'mile' };

describe('citiesOverlap', () => {
  it('returns true when distance < sum of radii', () => {
    expect(citiesOverlap(melbourne, richmond)).toBe(true);
  });
  it('returns false when cities are far apart', () => {
    expect(citiesOverlap(melbourne, sydney)).toBe(false);
  });
  it('treats identical keys as overlapping', () => {
    expect(citiesOverlap(melbourne, { ...melbourne, key: '1', lat: 0, lng: 0 })).toBe(true);
  });
  it('normalizes kilometers to miles before comparing', () => {
    const a: GeoCity = { key: 'a', name: 'A', lat: 0, lng: 0, radius: 17, distanceUnit: 'kilometer' };
    const b: GeoCity = { key: 'b', name: 'B', lat: 0, lng: 0.2, radius: 17, distanceUnit: 'kilometer' };
    expect(citiesOverlap(a, b)).toBe(true);
  });
  it('handles missing radius by using the 10-mile Meta default', () => {
    expect(citiesOverlap({ ...melbourne, radius: undefined }, { ...sydney, radius: undefined })).toBe(false);
  });
});

describe('findOverlap', () => {
  it('returns the first existing city that overlaps the candidate', () => {
    expect(findOverlap([melbourne, sydney], richmond)?.name).toBe('Melbourne');
  });
  it('returns null when nothing overlaps', () => {
    expect(findOverlap([sydney], melbourne)).toBeNull();
  });
  it('returns null for an empty list', () => {
    expect(findOverlap([], melbourne)).toBeNull();
  });
});
