import { ApiClient } from '../client';

/**
 * Typed marketplace search endpoints (PHASE-07 07-B/07-C). Mirrors the
 * backend contracts in apps/api/src/search/domain/search-contract.ts.
 */

export interface SearchOffersQueryInput {
  start: string;
  end: string;
  pickupLocationId?: string;
  pickupCity?: string;
  agencyId?: string;
  categoryId?: string;
  transmission?: string;
  fuelType?: string;
  seats?: number;
  features?: string;
  priceMinMinor?: number;
  priceMaxMinor?: number;
  lat?: number;
  lng?: number;
  /** 07-C09: pickup point must lie within radiusKm of (lat, lng). */
  radiusKm?: number;
  /** 07-C09: viewport filter "west,south,east,north" in decimal degrees. */
  bbox?: string;
  sort?: SearchSortValue;
  page?: number;
  limit?: number;
}

export type SearchSortValue = 'price_asc' | 'price_desc' | 'distance_asc';

export interface SearchBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SearchOffersResponseDto {
  items: SearchOfferDto[];
  total: number;
  page: number;
  limit: number;
  sort: SearchSortValue;
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

export interface SearchOfferDto {
  agency: {
    id: string;
    name: string;
    slug: string;
  };
  vehicle: {
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
  };
  pickupBranch: {
    id: string;
    name: string;
    location: {
      id: string;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    distanceKm: number | null;
  } | null;
  pricing: {
    currency: string;
    totalMinor: number;
    breakdown: Array<{ code: string; label?: string; amountMinor: number }>;
    depositMinor: number;
    calculatedAt: string;
  };
}

/** 07-C05/07-C06: public pickup-point feed for marketplace map pins. */
export interface MarketplaceBranchLocationDto {
  branch: { id: string; name: string };
  location: {
    id: string;
    name: string;
    city: string | null;
    latitude: number;
    longitude: number;
  };
  agency: { id: string; name: string; slug: string };
}

export interface SearchLocationsResponseDto {
  items: MarketplaceBranchLocationDto[];
  total: number;
}

export function createSearchApi(client: ApiClient): {
  offers: (query: SearchOffersQueryInput) => Promise<SearchOffersResponseDto>;
  locations: () => Promise<SearchLocationsResponseDto>;
} {
  return {
    offers: (query) =>
      client.get('/api/v1/search/offers', {
        query: {
          start: query.start,
          end: query.end,
          pickupLocationId: query.pickupLocationId,
          pickupCity: query.pickupCity,
          agencyId: query.agencyId,
          categoryId: query.categoryId,
          transmission: query.transmission,
          fuelType: query.fuelType,
          seats: query.seats === undefined ? undefined : String(query.seats),
          features: query.features,
          priceMinMinor: query.priceMinMinor === undefined ? undefined : String(query.priceMinMinor),
          priceMaxMinor: query.priceMaxMinor === undefined ? undefined : String(query.priceMaxMinor),
          lat: query.lat === undefined ? undefined : String(query.lat),
          lng: query.lng === undefined ? undefined : String(query.lng),
          radiusKm: query.radiusKm === undefined ? undefined : String(query.radiusKm),
          bbox: query.bbox,
          sort: query.sort,
          page: query.page === undefined ? undefined : String(query.page),
          limit: query.limit === undefined ? undefined : String(query.limit),
        },
      }),
    locations: () => client.get('/api/v1/search/locations'),
  };
}
