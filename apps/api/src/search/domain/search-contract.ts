import type { QuotePricingPayload } from '../../quotes/domain/quote-contract';

/**
 * Marketplace search contract (07-B01).
 *
 * `GET /api/v1/search/offers` is the public cross-agency discovery surface
 * (docs/40): it returns only offers that are actually bookable for the
 * requested context — active marketplace-enabled agencies, AVAILABLE
 * vehicles without interval conflicts, and server-computed pricing
 * (unpriced vehicles are never bookable-as-priced and are excluded).
 *
 * R1 boundaries (architecture/marketplace-search.md):
 * - pickup location filter = exact locationId or city text match (spatial
 *   proximity lands with 07-C09);
 * - offers are vehicle-level; category capacity display lands with the
 *   booking flows;
 * - the offer price is the pickup-context calculation (no return-branch
 *   one-way or delivery fees — those apply at quote/booking time);
 * - free-text ranking and ratings are later phases; deterministic
 *   price/distance sorts only.
 */

export const SearchErrorCode = {
  INVALID_INTERVAL: 'INVALID_INTERVAL',
  INTERVAL_IN_PAST: 'INTERVAL_IN_PAST',
  INTERVAL_TOO_LONG: 'INTERVAL_TOO_LONG',
  INVALID_PAGE: 'INVALID_PAGE',
  INVALID_LIMIT: 'INVALID_LIMIT',
  INVALID_SORT: 'INVALID_SORT',
  INVALID_PRICE_RANGE: 'INVALID_PRICE_RANGE',
  INVALID_SEATS: 'INVALID_SEATS',
  INVALID_FEATURES: 'INVALID_FEATURES',
  INVALID_LOCATION_QUERY: 'INVALID_LOCATION_QUERY',
  DISTANCE_REQUIRES_COORDINATES: 'DISTANCE_REQUIRES_COORDINATES',
  INVALID_COORDINATES: 'INVALID_COORDINATES',
  INVALID_RADIUS: 'INVALID_RADIUS',
  RADIUS_REQUIRES_COORDINATES: 'RADIUS_REQUIRES_COORDINATES',
  INVALID_BBOX: 'INVALID_BBOX',
} as const;

export type SearchErrorCodeValue = (typeof SearchErrorCode)[keyof typeof SearchErrorCode];

/** Raw query input — validated at the boundary, never trusted. */
export interface SearchOffersQuery {
  start?: unknown;
  end?: unknown;
  pickupLocationId?: unknown;
  pickupCity?: unknown;
  agencyId?: unknown;
  categoryId?: unknown;
  transmission?: unknown;
  fuelType?: unknown;
  seats?: unknown;
  features?: unknown;
  priceMinMinor?: unknown;
  priceMaxMinor?: unknown;
  lat?: unknown;
  lng?: unknown;
  /** 07-C09: proximity filter — pickup branch must lie within radiusKm of (lat, lng). */
  radiusKm?: unknown;
  /** 07-C09: viewport filter — "west,south,east,north" decimal degrees. */
  bbox?: unknown;
  sort?: unknown;
  page?: unknown;
  limit?: unknown;
}

export type SearchSortValue = 'price_asc' | 'price_desc' | 'distance_asc';

export const SEARCH_SORTS: readonly SearchSortValue[] = ['price_asc', 'price_desc', 'distance_asc'];

export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 50;
/** R1 guard: search intervals beyond 90 days are rejected (07-B03). */
export const SEARCH_MAX_INTERVAL_DAYS = 90;
/** 07-C09: proximity radius bounds (km). */
export const SEARCH_RADIUS_KM_MIN = 0.5;
export const SEARCH_RADIUS_KM_MAX = 500;

export interface AgencySummary {
  id: string;
  name: string;
  slug: string;
}

export interface OfferBranch {
  id: string;
  name: string;
  location: {
    id: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  /** Straight-line km from the search coordinates (null without lat/lng). */
  distanceKm: number | null;
}

export interface OfferVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  category: {
    id: string;
    name: string;
    transmission: string | null;
    fuelType: string | null;
    seats: number | null;
    features: string[];
  };
}

export interface SearchOffer {
  agency: AgencySummary;
  vehicle: OfferVehicle;
  pickupBranch: OfferBranch | null;
  pricing: QuotePricingPayload;
}

/** 07-C09: viewport bounds — inclusive decimal-degree rectangle. */
export interface SearchBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SearchOffersResponse {
  items: SearchOffer[];
  total: number;
  page: number;
  limit: number;
  sort: SearchSortValue;
  /** Echoed normalized filters (07-B11 empty-result transparency). */
  filters: {
    start: string;
    end: string;
    pickupLocationId: string | null;
    pickupCity: string | null;
    agencyId: string | null;
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
  };
}

/**
 * 07-C05/07-C06: public pickup-point feed for marketplace map markers.
 * Branches (pickup/parking points) of participating agencies — pins show
 * pickup locations, never exact live vehicle positions (privacy boundary
 * in docs/07).
 */
export interface MarketplaceBranchLocation {
  branch: {
    id: string;
    name: string;
  };
  location: {
    id: string;
    name: string;
    city: string | null;
    latitude: number;
    longitude: number;
  };
  agency: AgencySummary;
}

export interface SearchLocationsResponse {
  items: MarketplaceBranchLocation[];
  total: number;
}
