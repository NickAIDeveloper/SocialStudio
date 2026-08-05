// src/lib/ads/geo-overlap.ts
// Pure geo-overlap detection for Meta city targeting. Two cities "overlap" when
// the great-circle distance between their centers is less than the sum of their
// targeting radii. Meta rejects overlapping locations with subcode 1487756
// ("Some of your locations overlap"), so we catch it before any write.

export interface GeoCity {
  key: string;
  name: string;
  lat: number;
  lng: number;
  radius?: number; // Meta default is 10 miles when unset.
  distanceUnit?: 'mile' | 'kilometer';
}

const DEFAULT_RADIUS_MILES = 10;
const KM_PER_MILE = 1.609344;
const EARTH_RADIUS_MILES = 3958.7613;

function toMiles(radius: number | undefined, unit: GeoCity['distanceUnit']): number {
  const r = radius ?? DEFAULT_RADIUS_MILES;
  return unit === 'kilometer' ? r / KM_PER_MILE : r;
}

export function haversineMiles(a: GeoCity, b: GeoCity): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function citiesOverlap(a: GeoCity, b: GeoCity): boolean {
  if (a.key === b.key) return true;
  const sumRadii = toMiles(a.radius, a.distanceUnit) + toMiles(b.radius, b.distanceUnit);
  return haversineMiles(a, b) < sumRadii;
}

export function findOverlap(existing: GeoCity[], candidate: GeoCity): GeoCity | null {
  return existing.find((c) => citiesOverlap(c, candidate)) ?? null;
}

// ---------------------------------------------------------------------------
// Country vs city
// ---------------------------------------------------------------------------

export interface GeoCityWithCountry {
  key: string;
  name: string;
  /** ISO-2, from Meta's adgeolocation search. Absent on drafts saved before
   *  we started capturing it — those are let through rather than blocked. */
  countryCode?: string;
}

export interface CountryCityClash {
  city: string;
  countryCode: string;
}

/**
 * Meta rejects an ad set that targets a country AND a city inside that same
 * country ("Some of your locations overlap", subcode 1487756). The city-vs-city
 * check above does not catch it, which is how six ads on this account failed.
 *
 * Targeting the US plus London is NOT an overlap, so this compares the city's
 * own country rather than blocking any country+city combination.
 */
export function findCountryCityOverlap(
  countries: readonly string[],
  cities: readonly GeoCityWithCountry[],
): CountryCityClash | null {
  const targeted = new Set(countries.map((c) => c.trim().toUpperCase()).filter(Boolean));
  if (targeted.size === 0) return null;

  for (const city of cities) {
    const code = city.countryCode?.trim().toUpperCase();
    if (code && targeted.has(code)) {
      return { city: city.name, countryCode: code };
    }
  }
  return null;
}
