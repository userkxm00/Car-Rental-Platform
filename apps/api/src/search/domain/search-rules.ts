import { FEATURE_CATALOG } from '../../fleet/domain/feature-catalog';
import { isValidInterval } from '../../availability/domain/interval';
import { haversineDistanceKm } from '../../pricing/domain/commercial-rules';
import {
  SearchBoundingBox,
  SearchErrorCode,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  SEARCH_MAX_INTERVAL_DAYS,
  SEARCH_RADIUS_KM_MAX,
  SEARCH_RADIUS_KM_MIN,
  SEARCH_SORTS,
  SearchOffersQuery,
  SearchSortValue,
} from './search-contract';

/**
 * Pure marketplace-search rules (07-B): boundary validation, filter
 * normalization, deterministic ordering and distance math. Clock-injected
 * so every rule is unit-testable without a database.
 */

export interface ParsedSearchQuery {
  start: Date;
  end: Date;
  pickupLocationId: string | null;
  pickupCity: string | null;
  agencyId: string | null;
  vehicleId: string | null;
  categoryId: string | null;
  transmission: string | null;
  fuelType: string | null;
  seats: number | null;
  features: string[];
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  bbox: SearchBoundingBox | null;
  sort: SearchSortValue;
  page: number;
  limit: number;
}

export interface SearchRuleFailure {
  code: string;
  message: string;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_FILTER = 64;

const FEATURE_KEYS: readonly string[] = Object.values(FEATURE_CATALOG);

function parseText(value: unknown, code: string, field: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RangeError(`${code}: ${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_TEXT_FILTER) {
    throw new RangeError(`${code}: ${field} is too long.`);
  }
  return trimmed;
}

function parseOptionalUuid(value: unknown, code: string, field: string): string | null {
  const text = parseText(value, code, field);
  if (text === null) {
    return null;
  }
  if (!UUID_SHAPE.test(text)) {
    throw new RangeError(`${code}: ${field} must be a UUID.`);
  }
  return text.toLowerCase();
}

function parseBoundedInteger(
  value: unknown,
  code: string,
  field: string,
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw new RangeError(`${code}: ${field} must be an integer between ${min} and ${max}.`);
  }
  return numeric;
}

/** Half-open interval with R1 bounds: future start, valid order, ≤ 90 days. */
function parseInterval(
  startValue: unknown,
  endValue: unknown,
  now: Date,
): { start: Date; end: Date } {
  const start = typeof startValue === 'string' ? new Date(startValue) : new Date(NaN);
  const end = typeof endValue === 'string' ? new Date(endValue) : new Date(NaN);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !isValidInterval(start, end)) {
    throw new RangeError(`${SearchErrorCode.INVALID_INTERVAL}: start and end must be valid instants with start < end.`);
  }
  if (start.getTime() <= now.getTime()) {
    throw new RangeError(`${SearchErrorCode.INTERVAL_IN_PAST}: start must be in the future.`);
  }
  if (end.getTime() - start.getTime() > SEARCH_MAX_INTERVAL_DAYS * 24 * 60 * 60 * 1000) {
    throw new RangeError(
      `${SearchErrorCode.INTERVAL_TOO_LONG}: the search interval must not exceed ${SEARCH_MAX_INTERVAL_DAYS} days.`,
    );
  }
  return { start, end };
}

function parseCoordinate(
  value: unknown,
  field: 'lat' | 'lng',
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new RangeError(
      `${SearchErrorCode.INVALID_COORDINATES}: ${field} must be a number between ${min} and ${max}.`,
    );
  }
  return numeric;
}

function parseCoordinates(
  latValue: unknown,
  lngValue: unknown,
): { lat: number | null; lng: number | null } {
  const lat = parseCoordinate(latValue, 'lat', -90, 90);
  const lng = parseCoordinate(lngValue, 'lng', -180, 180);
  if (lat === null && lng === null) {
    return { lat: null, lng: null };
  }
  if (lat !== null && lng !== null) {
    return { lat, lng };
  }
  throw new RangeError(`${SearchErrorCode.INVALID_COORDINATES}: lat and lng must be provided together.`);
}

/** 07-C09: radius in km — bounded, finite, and only meaningful with coordinates. */
function parseRadiusKm(value: unknown, lat: number | null): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(numeric) || numeric < SEARCH_RADIUS_KM_MIN || numeric > SEARCH_RADIUS_KM_MAX) {
    throw new RangeError(
      `${SearchErrorCode.INVALID_RADIUS}: radiusKm must be a number between ${SEARCH_RADIUS_KM_MIN} and ${SEARCH_RADIUS_KM_MAX}.`,
    );
  }
  if (lat === null) {
    throw new RangeError(
      `${SearchErrorCode.RADIUS_REQUIRES_COORDINATES}: radiusKm requires lat and lng.`,
    );
  }
  return numeric;
}

/**
 * 07-C09: viewport bounds "west,south,east,north" in decimal degrees.
 * Rejects inverted or degenerate rectangles (antimeridian-spanning
 * viewports are out of scope for R1 — Algeria-centric market).
 */
function parseBbox(value: unknown): SearchBoundingBox | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new RangeError(`${SearchErrorCode.INVALID_BBOX}: bbox must be a "west,south,east,north" string.`);
  }
  const parts = value.split(',');
  if (parts.length !== 4) {
    throw new RangeError(`${SearchErrorCode.INVALID_BBOX}: bbox must have exactly four values: west,south,east,north.`);
  }
  const numbers = parts.map((part) => Number(part.trim()));
  if (numbers.some((numeric) => !Number.isFinite(numeric))) {
    throw new RangeError(`${SearchErrorCode.INVALID_BBOX}: bbox values must be numbers.`);
  }
  const [west, south, east, north] = numbers as [number, number, number, number];
  if (west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90) {
    throw new RangeError(`${SearchErrorCode.INVALID_BBOX}: bbox values are outside valid coordinate ranges.`);
  }
  if (west >= east || south >= north) {
    throw new RangeError(`${SearchErrorCode.INVALID_BBOX}: bbox must satisfy west < east and south < north.`);
  }
  return { west, south, east, north };
}

function parseFeatures(value: unknown): string[] {
  const text = parseText(value, SearchErrorCode.INVALID_FEATURES, 'features');
  if (text === null) {
    return [];
  }
  const keys = text
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  const invalid = keys.filter((key) => !FEATURE_KEYS.includes(key));
  if (invalid.length > 0) {
    throw new RangeError(
      `${SearchErrorCode.INVALID_FEATURES}: unknown feature keys: ${invalid.join(', ')}.`,
    );
  }
  return [...new Set(keys)];
}

/**
 * Parses and normalizes the raw search query. Throws `RangeError` with a
 * `<CODE>: <message>` payload — the service maps it to the stable 409
 * envelope.
 */
export function parseSearchQuery(query: SearchOffersQuery, now: Date): ParsedSearchQuery {
  const { start, end } = parseInterval(query.start, query.end, now);
  const pickupLocationId = parseOptionalUuid(
    query.pickupLocationId,
    SearchErrorCode.INVALID_LOCATION_QUERY,
    'pickupLocationId',
  );
  const pickupCity = parseText(query.pickupCity, SearchErrorCode.INVALID_LOCATION_QUERY, 'pickupCity');
  if (pickupLocationId && pickupCity) {
    throw new RangeError(
      `${SearchErrorCode.INVALID_LOCATION_QUERY}: pickupLocationId and pickupCity are mutually exclusive.`,
    );
  }
  const seats = parseBoundedInteger(query.seats, SearchErrorCode.INVALID_SEATS, 'seats', 1, 50);
  const { lat, lng } = parseCoordinates(query.lat, query.lng);
  const radiusKm = parseRadiusKm(query.radiusKm, lat);
  const bbox = parseBbox(query.bbox);

  const sortValue = parseText(query.sort, SearchErrorCode.INVALID_SORT, 'sort');
  const sort: SearchSortValue = sortValue === null ? 'price_asc' : (sortValue as SearchSortValue);
  if (!SEARCH_SORTS.includes(sort)) {
    throw new RangeError(
      `${SearchErrorCode.INVALID_SORT}: sort must be one of: ${SEARCH_SORTS.join(', ')}.`,
    );
  }
  if (sort === 'distance_asc' && lat === null) {
    throw new RangeError(
      `${SearchErrorCode.DISTANCE_REQUIRES_COORDINATES}: distance_asc requires lat and lng.`,
    );
  }

  const priceMin = parseBoundedInteger(
    query.priceMinMinor,
    SearchErrorCode.INVALID_PRICE_RANGE,
    'priceMinMinor',
    0,
    1_000_000_000_000,
  );
  const priceMax = parseBoundedInteger(
    query.priceMaxMinor,
    SearchErrorCode.INVALID_PRICE_RANGE,
    'priceMaxMinor',
    0,
    1_000_000_000_000,
  );
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    throw new RangeError(
      `${SearchErrorCode.INVALID_PRICE_RANGE}: priceMinMinor must not exceed priceMaxMinor.`,
    );
  }

  const page = parseBoundedInteger(query.page, SearchErrorCode.INVALID_PAGE, 'page', 1, 1_000_000) ?? 1;
  const limit =
    parseBoundedInteger(query.limit, SearchErrorCode.INVALID_LIMIT, 'limit', 1, SEARCH_LIMIT_MAX) ??
    SEARCH_LIMIT_DEFAULT;

  return {
    start,
    end,
    pickupLocationId,
    pickupCity,
    agencyId: parseOptionalUuid(query.agencyId, SearchErrorCode.INVALID_LOCATION_QUERY, 'agencyId'),
    vehicleId: parseOptionalUuid(query.vehicleId, SearchErrorCode.INVALID_VEHICLE_ID, 'vehicleId'),
    categoryId: parseOptionalUuid(query.categoryId, SearchErrorCode.INVALID_LOCATION_QUERY, 'categoryId'),
    transmission: parseText(query.transmission, SearchErrorCode.INVALID_LOCATION_QUERY, 'transmission'),
    fuelType: parseText(query.fuelType, SearchErrorCode.INVALID_LOCATION_QUERY, 'fuelType'),
    seats,
    features: parseFeatures(query.features),
    priceMinMinor: priceMin,
    priceMaxMinor: priceMax,
    lat,
    lng,
    radiusKm,
    bbox,
    sort,
    page,
    limit,
  };
}

export interface OfferOrderInput {
  totalMinor: number;
  distanceKm: number | null;
  agencyName: string;
  vehicleId: string;
}

const DEFAULT_DISTANCE = Number.POSITIVE_INFINITY;

/**
 * Deterministic offer ordering (07-B10): the requested sort, then fixed
 * tie-breaks — price asc → distance asc → agency name asc → vehicle id.
 * Null distances sort last.
 */
export function compareOffers(
  sort: SearchSortValue,
  a: OfferOrderInput,
  b: OfferOrderInput,
): number {
  let primary = 0;
  if (sort === 'price_asc') {
    primary = a.totalMinor - b.totalMinor;
  } else if (sort === 'price_desc') {
    primary = b.totalMinor - a.totalMinor;
  } else {
    const aDistance = a.distanceKm ?? DEFAULT_DISTANCE;
    const bDistance = b.distanceKm ?? DEFAULT_DISTANCE;
    primary = aDistance - bDistance;
  }
  if (primary !== 0) {
    return primary;
  }
  if (a.totalMinor !== b.totalMinor) {
    return a.totalMinor - b.totalMinor;
  }
  if ((a.distanceKm ?? DEFAULT_DISTANCE) !== (b.distanceKm ?? DEFAULT_DISTANCE)) {
    return (a.distanceKm ?? DEFAULT_DISTANCE) - (b.distanceKm ?? DEFAULT_DISTANCE);
  }
  const byName = a.agencyName.localeCompare(b.agencyName);
  if (byName !== 0) {
    return byName;
  }
  return a.vehicleId.localeCompare(b.vehicleId);
}

/** Straight-line distance in km; null when either side lacks coordinates. */
export function offerDistanceKm(
  lat: number | null,
  lng: number | null,
  branchLat: number | null,
  branchLng: number | null,
): number | null {
  if (lat === null || lng === null || branchLat === null || branchLng === null) {
    return null;
  }
  return haversineDistanceKm(lat, lng, branchLat, branchLng);
}

/** 07-B05: inclusive total-price range membership. */
export function withinPriceRange(
  totalMinor: number,
  min: number | null,
  max: number | null,
): boolean {
  if (min !== null && totalMinor < min) {
    return false;
  }
  if (max !== null && totalMinor > max) {
    return false;
  }
  return true;
}

/** 07-B06: any-of semantics for the feature filter. */
export function matchesFeatures(vehicleFeatures: readonly string[], requested: readonly string[]): boolean {
  if (requested.length === 0) {
    return true;
  }
  const set = new Set(vehicleFeatures);
  return requested.some((feature) => set.has(feature));
}

/**
 * 07-C09: inclusive radius membership. Branches without a computable
 * distance fail closed — proximity cannot be proven for them.
 */
export function withinRadiusKm(distanceKm: number | null, radiusKm: number | null): boolean {
  if (radiusKm === null) {
    return true;
  }
  return distanceKm !== null && distanceKm <= radiusKm;
}

/** 07-C09: inclusive viewport membership; missing coordinates fail closed. */
export function withinBbox(lat: number | null, lng: number | null, bbox: SearchBoundingBox | null): boolean {
  if (bbox === null) {
    return true;
  }
  if (lat === null || lng === null) {
    return false;
  }
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

/**
 * 07-C09: nearest-city-branch selection — when a city filter coexists
 * with coordinates, the map/list experience should pin the closest
 * matching pickup point instead of an arbitrary one. Deterministic:
 * distance asc → name asc → id asc.
 */
export function nearestByDistance<T extends { name: string; id: string }>(
  candidates: T[],
  lat: number | null,
  lng: number | null,
  locationOf: (candidate: T) => { latitude: number | null; longitude: number | null },
): T | null {
  if (candidates.length === 0) {
    return null;
  }
  const located = candidates
    .map((candidate) => ({
      candidate,
      distance: offerDistanceKm(lat, lng, locationOf(candidate).latitude, locationOf(candidate).longitude),
    }))
    .sort((a, b) => {
      const aDistance = a.distance ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distance ?? Number.POSITIVE_INFINITY;
      if (aDistance !== bDistance) {
        return aDistance - bDistance;
      }
      const byName = a.candidate.name.localeCompare(b.candidate.name);
      if (byName !== 0) {
        return byName;
      }
      return a.candidate.id.localeCompare(b.candidate.id);
    });
  return located[0]?.candidate ?? null;
}
