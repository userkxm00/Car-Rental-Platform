import type {
  MarketplaceBranchLocationDto,
  SearchOffersQueryInput,
  SearchOffersResponseDto,
  SearchSortValue,
} from '@kavriqo/api-client';

/**
 * Pure marketplace map/list state (07-C07) — the single source of truth
 * shared by the results list, the map pins and the search form. Reducer
 * is clock-independent and unit-testable; the map component is a thin
 * projection of this state.
 */

export interface Viewport {
  west: number;
  south: number;
  east: number;
  north: number;
  centerLat: number;
  centerLng: number;
}

export interface SearchFormState {
  start: string;
  end: string;
  pickupLocationId: string | null;
  pickupCity: string | null;
  /** Coordinates of the chosen pickup point (geocoder / current location). */
  pickupLat: number | null;
  pickupLng: number | null;
  seats: string;
  transmission: string;
  fuelType: string;
  priceMaxMinor: string;
  sort: SearchSortValue;
  page: number;
  limit: number;
}

export interface MarketplaceUiState {
  mode: 'map' | 'list';
  viewport: Viewport | null;
  mapMoved: boolean;
  selectedOfferIndex: number | null;
  hoveredOfferIndex: number | null;
  locations: MarketplaceBranchLocationDto[];
  results: SearchOffersResponseDto | null;
  pending: boolean;
  error: string | null;
  lastQuery: SearchOffersQueryInput | null;
}

export interface MarketplaceState {
  form: SearchFormState;
  ui: MarketplaceUiState;
}

export type MarketplaceAction =
  | { type: 'FORM_UPDATED'; patch: Partial<SearchFormState> }
  | { type: 'FORM_RESET' }
  | { type: 'SUBMITTED'; query: SearchOffersQueryInput }
  | { type: 'RESULTS_LOADED'; results: SearchOffersResponseDto }
  | { type: 'RESULTS_FAILED'; error: string }
  | { type: 'LOCATIONS_LOADED'; locations: MarketplaceBranchLocationDto[] }
  | { type: 'VIEWPORT_CHANGED'; viewport: Viewport }
  | { type: 'MODE_TOGGLED' }
  | { type: 'OFFER_SELECTED'; index: number | null }
  | { type: 'OFFER_HOVERED'; index: number | null };

/** Local datetime input value, `days` from now at `hour`:00. */
export function localInputValue(days: number, hour = 9): string {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Default bookable window (tomorrow → +2 days) as ISO instants. */
export function defaultIntervalIso(): { start: string; end: string } {
  return { start: new Date(localInputValue(1)).toISOString(), end: new Date(localInputValue(3)).toISOString() };
}

export function initialState(): MarketplaceState {
  return {
    form: {
      start: localInputValue(1),
      end: localInputValue(3),
      pickupLocationId: null,
      pickupCity: null,
      pickupLat: null,
      pickupLng: null,
      seats: '',
      transmission: '',
      fuelType: '',
      priceMaxMinor: '',
      sort: 'price_asc',
      page: 1,
      limit: 20,
    },
    ui: {
      mode: 'map',
      viewport: null,
      mapMoved: false,
      selectedOfferIndex: null,
      hoveredOfferIndex: null,
      locations: [],
      results: null,
      pending: false,
      error: null,
      lastQuery: null,
    },
  };
}

/** Numeric-string fields only accept digits; bounded when applicable. */
function clampNumericField(patch: Partial<SearchFormState>): Partial<SearchFormState> {
  const next = { ...patch };
  if (typeof next.priceMaxMinor === 'string' && next.priceMaxMinor.length > 12) {
    next.priceMaxMinor = next.priceMaxMinor.slice(0, 12);
  }
  if (typeof next.seats === 'string' && next.seats.length > 2) {
    next.seats = next.seats.slice(0, 2);
  }
  if (typeof next.page === 'number') {
    next.page = Math.max(1, next.page);
  }
  if (typeof next.limit === 'number') {
    next.limit = Math.min(50, Math.max(1, next.limit));
  }
  return next;
}

function viewportOf(results: SearchOffersResponseDto): Viewport | null {
  const points = results.items
    .map((item) => item.pickupBranch)
    .filter((branch): branch is NonNullable<typeof branch> => branch !== null)
    .map((branch) => branch.location)
    .filter((location) => location.latitude !== null && location.longitude !== null);
  if (points.length === 0) {
    return null;
  }
  const latitudes = points.map((point) => point.latitude as number);
  const longitudes = points.map((point) => point.longitude as number);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  // Degenerate single-point viewport: pad ~0.25° so the map still zooms.
  const latPad = north - south < 0.01 ? 0.25 : (north - south) * 0.15;
  const lngPad = east - west < 0.01 ? 0.25 : (east - west) * 0.15;
  return {
    west: west - lngPad,
    south: south - latPad,
    east: east + lngPad,
    north: north + latPad,
    centerLat: (south + north) / 2,
    centerLng: (west + east) / 2,
  };
}

export function marketplaceReducer(state: MarketplaceState, action: MarketplaceAction): MarketplaceState {
  switch (action.type) {
    case 'FORM_UPDATED': {
      const patch = clampNumericField(action.patch);
      const pageChanged = typeof patch.page === 'number' && patch.page !== state.form.page;
      return {
        ...state,
        form: { ...state.form, ...patch },
        // Changing any filter returns to the first page.
        ui: pageChanged ? state.ui : { ...state.ui, selectedOfferIndex: null },
      };
    }
    case 'FORM_RESET':
      return { ...initialState(), ui: state.ui };
    case 'SUBMITTED':
      return {
        ...state,
        ui: {
          ...state.ui,
          pending: true,
          error: null,
          selectedOfferIndex: null,
          lastQuery: action.query,
        },
      };
    case 'RESULTS_LOADED':
      return {
        ...state,
        ui: {
          ...state.ui,
          pending: false,
          error: null,
          results: action.results,
          // 07-C07: results move the map to the offer area — unless the
          // user has intentionally moved the map (search-this-area flow).
          viewport: state.ui.mapMoved ? state.ui.viewport : (viewportOf(action.results) ?? state.ui.viewport),
          mapMoved: false,
        },
      };
    case 'RESULTS_FAILED':
      return { ...state, ui: { ...state.ui, pending: false, error: action.error } };
    case 'LOCATIONS_LOADED':
      return { ...state, ui: { ...state.ui, locations: action.locations } };
    case 'VIEWPORT_CHANGED':
      return {
        ...state,
        ui: {
          ...state.ui,
          viewport: action.viewport,
          mapMoved: true,
        },
      };
    case 'MODE_TOGGLED':
      return {
        ...state,
        ui: { ...state.ui, mode: state.ui.mode === 'map' ? 'list' : 'map' },
      };
    case 'OFFER_SELECTED':
      return { ...state, ui: { ...state.ui, selectedOfferIndex: action.index } };
    case 'OFFER_HOVERED':
      return { ...state, ui: { ...state.ui, hoveredOfferIndex: action.index } };
  }
}

/** "west,south,east,north" — the server's 07-C09 viewport filter. */
export function bboxParam(viewport: Viewport): string {
  return `${viewport.west},${viewport.south},${viewport.east},${viewport.north}`;
}

/**
 * Builds the server query from the form. Returns null when the form is
 * not submittable (dates are always prefilled in the UI, but the pure
 * state stays honest).
 */
export function buildSearchQuery(form: SearchFormState, viewport: Viewport | null): SearchOffersQueryInput | null {
  if (!form.start || !form.end || form.start >= form.end) {
    return null;
  }
  const query: SearchOffersQueryInput = {
    start: new Date(form.start).toISOString(),
    end: new Date(form.end).toISOString(),
    sort: form.sort,
    page: form.page,
    limit: form.limit,
  };
  if (form.pickupLocationId) {
    query.pickupLocationId = form.pickupLocationId;
  } else if (form.pickupCity) {
    query.pickupCity = form.pickupCity;
  }
  if (form.seats) {
    query.seats = Number(form.seats);
  }
  if (form.transmission) {
    query.transmission = form.transmission;
  }
  if (form.fuelType) {
    query.fuelType = form.fuelType;
  }
  if (form.priceMaxMinor) {
    query.priceMaxMinor = Number(form.priceMaxMinor);
  }
  if (form.pickupLat !== null && form.pickupLng !== null) {
    query.lat = form.pickupLat;
    query.lng = form.pickupLng;
  }
  if (viewport) {
    query.bbox = bboxParam(viewport);
  }
  return query;
}

export interface MarkerFeature {
  id: string;
  latitude: number;
  longitude: number;
  kind: 'offer' | 'location';
  title: string;
  city: string | null;
  agencyName: string;
  offerIndex: number | null;
  priceMinor: number | null;
  distanceKm: number | null;
}

/**
 * 07-C05: pins for offer pickup branches (never live vehicle positions —
 * docs/07 privacy boundary). Offers without pickup coordinates are
 * skipped.
 */
export function markerFeaturesFromResults(results: SearchOffersResponseDto | null): MarkerFeature[] {
  const features: MarkerFeature[] = [];
  (results?.items ?? []).forEach((item, index) => {
    const branch = item.pickupBranch;
    if (!branch || branch.location.latitude === null || branch.location.longitude === null) {
      return;
    }
    features.push({
      id: `offer-${item.vehicle.id}-${branch.id}`,
      latitude: branch.location.latitude,
      longitude: branch.location.longitude,
      kind: 'offer',
      title: item.vehicle.make + ' ' + item.vehicle.model,
      city: branch.location.city,
      agencyName: item.agency.name,
      offerIndex: index,
      priceMinor: item.pricing.totalMinor,
      distanceKm: branch.distanceKm,
    });
  });
  return features;
}

/** 07-C05/07-C06: pins for the participating-agency pickup-point feed. */
export function markerFeaturesFromLocations(locations: MarketplaceBranchLocationDto[]): MarkerFeature[] {
  return locations.map((item) => ({
    id: `location-${item.branch.id}`,
    latitude: item.location.latitude,
    longitude: item.location.longitude,
    kind: 'location',
    title: item.branch.name,
    city: item.location.city,
    agencyName: item.agency.name,
    offerIndex: null,
    priceMinor: null,
    distanceKm: null,
  }));
}

/** GeoJSON source for MapLibre with native clustering (07-C06). */
export function toGeoJson(features: MarkerFeature[]): {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    properties: Omit<MarkerFeature, 'latitude' | 'longitude'>;
    geometry: { type: 'Point'; coordinates: [number, number] };
  }>;
} {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => ({
      type: 'Feature',
      id: feature.id,
      properties: {
        id: feature.id,
        kind: feature.kind,
        title: feature.title,
        city: feature.city,
        agencyName: feature.agencyName,
        offerIndex: feature.offerIndex,
        priceMinor: feature.priceMinor,
        distanceKm: feature.distanceKm,
      },
      geometry: { type: 'Point', coordinates: [feature.longitude, feature.latitude] },
    })),
  };
}
