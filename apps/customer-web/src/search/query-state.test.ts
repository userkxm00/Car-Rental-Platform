import { describe, expect, it } from 'vitest';
import type { MarketplaceBranchLocationDto, SearchOffersResponseDto } from '@kavriqo/api-client';
import {
  bboxParam,
  buildSearchQuery,
  initialState,
  markerFeaturesFromLocations,
  markerFeaturesFromResults,
  marketplaceReducer,
  toGeoJson,
} from './query-state';

const NOW = new Date('2026-10-01T09:00:00');

function offerResponse(items: SearchOffersResponseDto['items'], total = items.length): SearchOffersResponseDto {
  return {
    items,
    total,
    page: 1,
    limit: 20,
    sort: 'price_asc',
    filters: {
      start: '2026-10-02T09:00:00.000Z',
      end: '2026-10-04T09:00:00.000Z',
      pickupLocationId: null,
      pickupCity: null,
      agencyId: null,
      categoryId: null,
      transmission: null,
      fuelType: null,
      seats: null,
      features: [],
      priceMinMinor: null,
      priceMaxMinor: null,
      lat: null,
      lng: null,
      radiusKm: null,
      bbox: null,
    },
  };
}

function offer(branchLat: number | null, branchLng: number | null, totalMinor = 9000): SearchOffersResponseDto['items'][0] {
  return {
    agency: { id: 'a1', name: 'Agence Oran', slug: 'agence-oran' },
    vehicle: {
      id: 'v1',
      make: 'Dacia',
      model: 'Logan',
      year: 2024,
      plateNumber: 'P-1',
      category: {
        id: 'c1',
        name: 'Economy',
        transmission: 'MANUAL',
        fuelType: 'DIESEL',
        seats: 5,
        features: ['air_conditioning'],
      },
    },
    pickupBranch: {
      id: 'b1',
      name: 'Centre',
      location: { id: 'l1', city: 'Oran', latitude: branchLat, longitude: branchLng },
      distanceKm: branchLat === null ? null : 2.5,
    },
    pricing: {
      currency: 'DZD',
      totalMinor,
      breakdown: [{ code: 'RENTAL', amountMinor: totalMinor }],
      depositMinor: 0,
      calculatedAt: NOW.toISOString(),
    },
  };
}

describe('initial state', () => {
  it('defaults to tomorrow→+2 days and price_asc', () => {
    const state = initialState();
    expect(state.form.sort).toBe('price_asc');
    expect(state.form.page).toBe(1);
    expect(state.form.limit).toBe(20);
    expect(new Date(state.form.start).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(state.form.end).getTime()).toBeGreaterThan(new Date(state.form.start).getTime());
  });
});

describe('buildSearchQuery', () => {
  it('refuses empty or inverted intervals', () => {
    const state = initialState();
    expect(buildSearchQuery({ ...state.form, start: '' }, null)).toBeNull();
    expect(
      buildSearchQuery({ ...state.form, start: '2026-10-05T09:00', end: '2026-10-04T09:00' }, null),
    ).toBeNull();
  });

  it('maps the form to server parameters', () => {
    const state = initialState();
    const query = buildSearchQuery(
      {
        ...state.form,
        start: '2026-10-02T09:00',
        end: '2026-10-04T09:00',
        pickupCity: 'Oran',
        seats: '5',
        transmission: 'AUTOMATIC',
        fuelType: 'DIESEL',
        priceMaxMinor: '50000',
        pickupLat: 35.7,
        pickupLng: -0.63,
        page: 2,
      },
      null,
    );
    expect(query).not.toBeNull();
    expect(query).toMatchObject({
      start: new Date('2026-10-02T09:00').toISOString(),
      end: new Date('2026-10-04T09:00').toISOString(),
      pickupCity: 'Oran',
      seats: 5,
      transmission: 'AUTOMATIC',
      fuelType: 'DIESEL',
      priceMaxMinor: 50000,
      lat: 35.7,
      lng: -0.63,
      page: 2,
      sort: 'price_asc',
    });
    expect(query?.bbox).toBeUndefined();
  });

  it('prefers an explicit location id and attaches the viewport bbox', () => {
    const state = initialState();
    const viewport = { west: -5, south: 34, east: 1, north: 37, centerLat: 35.5, centerLng: -2 };
    const query = buildSearchQuery(
      { ...state.form, pickupLocationId: 'loc-1', pickupCity: 'Oran' },
      viewport,
    );
    expect(query?.pickupLocationId).toBe('loc-1');
    expect(query?.pickupCity).toBeUndefined();
    expect(query?.bbox).toBe(bboxParam(viewport));
  });
});

describe('marker features (07-C05)', () => {
  it('maps offer pickup branches and skips missing coordinates', () => {
    const results = offerResponse([offer(35.7, -0.63, 9000), offer(null, null, 8000)]);
    const features = markerFeaturesFromResults(results);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      kind: 'offer',
      title: 'Dacia Logan',
      city: 'Oran',
      agencyName: 'Agence Oran',
      offerIndex: 0,
      priceMinor: 9000,
      distanceKm: 2.5,
      latitude: 35.7,
      longitude: -0.63,
    });
  });

  it('maps the locations feed pins', () => {
    const locations: MarketplaceBranchLocationDto[] = [
      {
        branch: { id: 'b1', name: 'Aéroport' },
        location: { id: 'l1', name: 'Oran Airport', city: 'Es Sénia', latitude: 35.62, longitude: -0.61 },
        agency: { id: 'a1', name: 'Agence Oran', slug: 'agence-oran' },
      },
    ];
    const features = markerFeaturesFromLocations(locations);
    expect(features[0]).toMatchObject({ kind: 'location', title: 'Aéroport', offerIndex: null, priceMinor: null });
  });

  it('emits GeoJSON with [lng, lat] point coordinates', () => {
    const geoJson = toGeoJson(markerFeaturesFromLocations([
      {
        branch: { id: 'b1', name: 'Centre' },
        location: { id: 'l1', name: 'Oran', city: 'Oran', latitude: 35.7, longitude: -0.63 },
        agency: { id: 'a1', name: 'A', slug: 'a' },
      },
    ]));
    expect(geoJson.type).toBe('FeatureCollection');
    expect(geoJson.features[0].geometry).toEqual({ type: 'Point', coordinates: [-0.63, 35.7] });
    expect(geoJson.features[0].properties.kind).toBe('location');
  });

  it('stays fast on payloads far beyond the 50-offer page cap (07-C11)', () => {
    // 2 000 offers ≈ 40× the maximum page size: the marker pipeline
    // (map → GeoJSON) must remain well under a second on any CI box.
    const items = Array.from({ length: 2000 }, (_, index) => offer(35.7 + index * 0.001, -0.63, 9000));
    const started = performance.now();
    const features = markerFeaturesFromResults(offerResponse(items, items.length));
    const geoJson = toGeoJson(features);
    const elapsed = performance.now() - started;
    expect(features).toHaveLength(2000);
    expect(geoJson.features).toHaveLength(2000);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('marketplace reducer (07-C07/07-C08)', () => {
  it('fits the map to results when the user has not moved it', () => {
    const state = initialState();
    const results = offerResponse([offer(35.7, -0.63), offer(35.8, -0.5)]);
    const next = marketplaceReducer(state, { type: 'RESULTS_LOADED', results });
    expect(next.ui.mapMoved).toBe(false);
    expect(next.ui.viewport).not.toBeNull();
    expect(next.ui.viewport?.south).toBeLessThanOrEqual(35.7);
    expect(next.ui.viewport?.north).toBeGreaterThanOrEqual(35.8);
  });

  it('keeps the user viewport when the map was moved (search-this-area)', () => {
    const state = initialState();
    const userViewport = { west: -5, south: 34, east: 1, north: 37, centerLat: 35.5, centerLng: -2 };
    const moved = marketplaceReducer(state, { type: 'VIEWPORT_CHANGED', viewport: userViewport });
    expect(moved.ui.mapMoved).toBe(true);
    const loaded = marketplaceReducer(moved, { type: 'RESULTS_LOADED', results: offerResponse([offer(35.7, -0.63)]) });
    expect(loaded.ui.viewport).toBe(userViewport);
  });

  it('clamps numeric fields and resets the page on filter changes', () => {
    const state = initialState();
    const next = marketplaceReducer(state, {
      type: 'FORM_UPDATED',
      patch: { priceMaxMinor: '1234567890123456', page: 0, limit: 999 },
    });
    expect(next.form.priceMaxMinor).toHaveLength(12);
    expect(next.form.page).toBe(1);
    expect(next.form.limit).toBe(50);
  });

  it('toggles the map/list mode and tracks selection', () => {
    const state = initialState();
    expect(state.ui.mode).toBe('map');
    const listed = marketplaceReducer(state, { type: 'MODE_TOGGLED' });
    expect(listed.ui.mode).toBe('list');
    const selected = marketplaceReducer(listed, { type: 'OFFER_SELECTED', index: 3 });
    expect(selected.ui.selectedOfferIndex).toBe(3);
  });
});
