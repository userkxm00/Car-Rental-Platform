import {
  compareOffers,
  matchesFeatures,
  nearestByDistance,
  offerDistanceKm,
  parseSearchQuery,
  withinBbox,
  withinPriceRange,
  withinRadiusKm,
} from './search-rules';

const NOW = new Date('2026-09-01T10:00:00.000Z');
const FUTURE_START = '2026-10-01T09:00:00.000Z';
const FUTURE_END = '2026-10-05T09:00:00.000Z';

function codeOf(query: Record<string, unknown>): string {
  try {
    parseSearchQuery(query, NOW);
  } catch (error) {
    const message = (error as RangeError).message;
    return message.slice(0, message.indexOf(': '));
  }
  throw new Error('Expected a RangeError.');
}

describe('search query parsing (07-B01/B03)', () => {
  it('parses a minimal valid query with defaults', () => {
    const parsed = parseSearchQuery({ start: FUTURE_START, end: FUTURE_END }, NOW);
    expect(parsed).toMatchObject({
      sort: 'price_asc',
      page: 1,
      limit: 20,
      pickupLocationId: null,
      pickupCity: null,
      features: [],
      seats: null,
      lat: null,
      lng: null,
    });
    expect(parsed.start.toISOString()).toBe(FUTURE_START);
  });

  it('rejects missing, malformed and past intervals', () => {
    expect(codeOf({})).toBe('INVALID_INTERVAL');
    expect(codeOf({ start: 'nope', end: FUTURE_END })).toBe('INVALID_INTERVAL');
    expect(codeOf({ start: FUTURE_END, end: FUTURE_START })).toBe('INVALID_INTERVAL');
    expect(codeOf({ start: '2020-01-01T09:00:00.000Z', end: FUTURE_END })).toBe('INTERVAL_IN_PAST');
    expect(
      codeOf({ start: FUTURE_START, end: '2027-01-05T09:00:00.000Z' }),
    ).toBe('INTERVAL_TOO_LONG');
  });

  it('normalizes location filters and rejects the ambiguous combination', () => {
    const byId = parseSearchQuery(
      { start: FUTURE_START, end: FUTURE_END, pickupLocationId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' },
      NOW,
    );
    expect(byId.pickupLocationId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(parseSearchQuery({ start: FUTURE_START, end: FUTURE_END, pickupCity: '  Oran  ' }, NOW).pickupCity).toBe('Oran');
    expect(
      codeOf({ start: FUTURE_START, end: FUTURE_END, pickupLocationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', pickupCity: 'Oran' }),
    ).toBe('INVALID_LOCATION_QUERY');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, pickupLocationId: 'nope' })).toBe(
      'INVALID_LOCATION_QUERY',
    );
  });

  it('validates pagination bounds', () => {
    expect(parseSearchQuery({ start: FUTURE_START, end: FUTURE_END, page: '2', limit: '50' }, NOW)).toMatchObject({
      page: 2,
      limit: 50,
    });
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, page: '0' })).toBe('INVALID_PAGE');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, limit: '51' })).toBe('INVALID_LIMIT');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, limit: 'many' })).toBe('INVALID_LIMIT');
  });

  it('validates sorts and the distance-sort coordinate requirement', () => {
    expect(parseSearchQuery({ start: FUTURE_START, end: FUTURE_END, sort: 'price_desc' }, NOW).sort).toBe('price_desc');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, sort: 'rating' })).toBe('INVALID_SORT');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, sort: 'distance_asc' })).toBe(
      'DISTANCE_REQUIRES_COORDINATES',
    );
    expect(
      parseSearchQuery({ start: FUTURE_START, end: FUTURE_END, sort: 'distance_asc', lat: '35.7', lng: '-0.6' }, NOW).sort,
    ).toBe('distance_asc');
  });

  it('validates coordinates, price ranges, seats and features', () => {
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, lat: '35.7' })).toBe('INVALID_COORDINATES');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, lat: '91', lng: '0' })).toBe('INVALID_COORDINATES');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, priceMinMinor: '5000', priceMaxMinor: '4000' })).toBe(
      'INVALID_PRICE_RANGE',
    );
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, seats: '0' })).toBe('INVALID_SEATS');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, features: 'wings,air_conditioning' })).toBe(
      'INVALID_FEATURES',
    );
    const parsed = parseSearchQuery(
      { start: FUTURE_START, end: FUTURE_END, features: 'air_conditioning,gps_navigation,air_conditioning', priceMinMinor: '1000' },
      NOW,
    );
    expect(parsed.features).toEqual(['air_conditioning', 'gps_navigation']);
    expect(parsed.priceMinMinor).toBe(1000);
  });

  it('parses the vehicleId filter (07-D09) and rejects malformed values', () => {
    const parsed = parseSearchQuery(
      { start: FUTURE_START, end: FUTURE_END, vehicleId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' },
      NOW,
    );
    expect(parsed.vehicleId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(parseSearchQuery({ start: FUTURE_START, end: FUTURE_END }, NOW).vehicleId).toBeNull();
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, vehicleId: 'nope' })).toBe('INVALID_VEHICLE_ID');
    expect(codeOf({ start: FUTURE_START, end: FUTURE_END, vehicleId: 42 })).toBe('INVALID_VEHICLE_ID');
  });
});

describe('offer ordering (07-B10)', () => {
  const base = { agencyName: 'B', vehicleId: 'v1' };

  it('sorts by price ascending with deterministic tie-breaks', () => {
    const a = { ...base, totalMinor: 2000, distanceKm: 10 };
    const b = { ...base, totalMinor: 1000, distanceKm: 20 };
    expect(compareOffers('price_asc', a, b)).toBeGreaterThan(0);
    expect(compareOffers('price_asc', b, a)).toBeLessThan(0);

    const c = { ...base, totalMinor: 2000, distanceKm: 5, agencyName: 'A', vehicleId: 'v2' };
    expect(compareOffers('price_asc', a, c)).toBeGreaterThan(0); // same price → distance
    expect(compareOffers('price_desc', a, b)).toBeLessThan(0);
  });

  it('sorts by distance with null distances last', () => {
    const near = { ...base, totalMinor: 5000, distanceKm: 2 };
    const far = { ...base, totalMinor: 1000, distanceKm: 8 };
    const unknown = { ...base, totalMinor: 1, distanceKm: null };
    expect(compareOffers('distance_asc', near, far)).toBeLessThan(0);
    expect(compareOffers('distance_asc', unknown, near)).toBeGreaterThan(0);
  });

  it('is a total order on equal inputs', () => {
    const a = { ...base, totalMinor: 1000, distanceKm: 3 };
    const b = { ...base, totalMinor: 1000, distanceKm: 3 };
    expect(compareOffers('price_asc', a, b)).toBe(0);
  });
});

describe('filter helpers (07-B05/B06)', () => {
  it('applies inclusive price ranges', () => {
    expect(withinPriceRange(5000, null, null)).toBe(true);
    expect(withinPriceRange(5000, 5000, 5000)).toBe(true);
    expect(withinPriceRange(4999, 5000, null)).toBe(false);
    expect(withinPriceRange(5001, null, 5000)).toBe(false);
  });

  it('applies any-of feature matching', () => {
    expect(matchesFeatures(['air_conditioning'], [])).toBe(true);
    expect(matchesFeatures(['air_conditioning', 'bluetooth'], ['bluetooth'])).toBe(true);
    expect(matchesFeatures(['air_conditioning'], ['gps_navigation'])).toBe(false);
    expect(matchesFeatures([], ['gps_navigation'])).toBe(false);
  });

  it('computes straight-line distances only with full coordinates', () => {
    expect(offerDistanceKm(null, null, 35, -0.6)).toBeNull();
    expect(offerDistanceKm(36.7, 3.06, null, null)).toBeNull();
    // ~1 degree of latitude ≈ 111.19 km.
    const distance = offerDistanceKm(36.0, 3.0, 37.0, 3.0);
    expect(distance).not.toBeNull();
    expect(distance as number).toBeGreaterThan(110);
    expect(distance as number).toBeLessThan(113);
  });
});

describe('spatial proximity parsing (07-C09)', () => {
  const base = { start: FUTURE_START, end: FUTURE_END };

  it('parses a valid radius with coordinates and echoes it', () => {
    const parsed = parseSearchQuery({ ...base, lat: '35.7', lng: '-0.63', radiusKm: '12.5' }, NOW);
    expect(parsed.radiusKm).toBe(12.5);
    expect(parsed.lat).toBe(35.7);
  });

  it('rejects out-of-bounds and coordinate-less radii', () => {
    expect(codeOf({ ...base, lat: '35.7', lng: '-0.63', radiusKm: '0' })).toBe('INVALID_RADIUS');
    expect(codeOf({ ...base, lat: '35.7', lng: '-0.63', radiusKm: '501' })).toBe('INVALID_RADIUS');
    expect(codeOf({ ...base, lat: '35.7', lng: '-0.63', radiusKm: 'abc' })).toBe('INVALID_RADIUS');
    expect(codeOf({ ...base, radiusKm: '10' })).toBe('RADIUS_REQUIRES_COORDINATES');
  });

  it('parses a valid bbox and rejects malformed bounds', () => {
    const parsed = parseSearchQuery({ ...base, bbox: '-5.5, 34, 1.25, 37' }, NOW);
    expect(parsed.bbox).toEqual({ west: -5.5, south: 34, east: 1.25, north: 37 });

    expect(codeOf({ ...base, bbox: '1,2' })).toBe('INVALID_BBOX');
    expect(codeOf({ ...base, bbox: '1,2,3,x' })).toBe('INVALID_BBOX');
    expect(codeOf({ ...base, bbox: '5,34,1,37' })).toBe('INVALID_BBOX'); // west >= east
    expect(codeOf({ ...base, bbox: '-5,38,-1,37' })).toBe('INVALID_BBOX'); // south >= north
    expect(codeOf({ ...base, bbox: '-181,34,1,37' })).toBe('INVALID_BBOX');
  });

  it('applies inclusive radius membership and fails closed without distance', () => {
    expect(withinRadiusKm(9.9, 10)).toBe(true);
    expect(withinRadiusKm(10, 10)).toBe(true);
    expect(withinRadiusKm(10.1, 10)).toBe(false);
    expect(withinRadiusKm(null, 10)).toBe(false);
    expect(withinRadiusKm(500, null)).toBe(true);
  });

  it('applies inclusive bbox membership and fails closed without coordinates', () => {
    const bbox = { west: -5, south: 34, east: 1, north: 37 };
    expect(withinBbox(35.7, -0.63, bbox)).toBe(true);
    expect(withinBbox(34, -5, bbox)).toBe(true); // edge-inclusive
    expect(withinBbox(36.75, 3.06, bbox)).toBe(false);
    expect(withinBbox(null, null, bbox)).toBe(false);
    expect(withinBbox(35.7, -0.63, null)).toBe(true);
  });

  it('picks the nearest candidate deterministically', () => {
    const candidates = [
      { id: 'far', name: 'Far', latitude: 35.9, longitude: -0.7 },
      { id: 'near', name: 'Near', latitude: 35.7, longitude: -0.63 },
    ];
    const picked = nearestByDistance(candidates, 35.69, -0.65, (candidate) => candidate);
    expect(picked?.id).toBe('near');
    expect(nearestByDistance([], 35, -0.6, (candidate) => candidate)).toBeNull();
  });
});
