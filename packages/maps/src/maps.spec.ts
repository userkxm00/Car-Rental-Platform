import {
  createMapProviders,
  createMapTilerGeocoding,
  createMapTilerTiles,
} from './maptiler';
import { haversineKm, osmDirectionsUrl } from './distance';
import { OSM_STYLE_SPEC, osmFallbackTiles } from './osm-fallback';
import { providerCapabilityStatus } from './provider-contract';

describe('MapTiler tiles adapter', () => {
  it('builds the style URL only when a key is configured', () => {
    const withoutKey = createMapTilerTiles(null);
    expect(withoutKey.enabled).toBe(false);
    expect(withoutKey.styleUrl()).toBeNull();

    const withKey = createMapTilerTiles('k123');
    expect(withKey.enabled).toBe(true);
    expect(withKey.styleUrl()).toBe('https://api.maptiler.com/maps/streets-v2/style.json?key=k123');
    expect(withKey.attribution).toContain('MapTiler');
  });

  it('treats blank keys as unconfigured', () => {
    expect(createMapTilerTiles('   ').enabled).toBe(false);
    expect(createMapTilerTiles(undefined).enabled).toBe(false);
  });
});

describe('MapTiler geocoding adapter', () => {
  const feature = (placeName: string, center: [number, number], type: string) => ({
    place_name: placeName,
    center,
    place_type: [type],
    text: placeName.split(',')[0],
    properties: { country_code: 'dz', locality: 'Oran' },
  });

  it('is disabled without a key', () => {
    const provider = createMapTilerGeocoding({ apiKey: undefined });
    expect(provider.enabled).toBe(false);
  });

  it('maps geocoding responses to provider-neutral suggestions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
        features: [feature('Oran, Algeria', [-0.63, 35.7], 'locality')],
      }),
    });
    const provider = createMapTilerGeocoding({ apiKey: 'k', language: 'fr', fetchImpl });
    const results = await provider.geocode('Oran');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      label: 'Oran, Algeria',
      name: 'Oran',
      latitude: 35.7,
      longitude: -0.63,
      kind: 'locality',
      city: 'Oran',
      countryCode: 'DZ',
    });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('language=fr'));
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/geocoding/Oran.json'));
  });

  it('uses fuzzy suggestions for autocomplete and caps the limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ features: [] }),
    });
    const provider = createMapTilerGeocoding({ apiKey: 'k', fetchImpl });
    await provider.suggest('Orn', { limit: 99 });
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).toContain('fuzzy=true');
    expect(url).toContain('limit=10');
  });

  it('surfaces provider failures as errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: () =>
        Promise.resolve({}) });
    const provider = createMapTilerGeocoding({ apiKey: 'k', fetchImpl });
    await expect(provider.geocode('Oran')).rejects.toThrow('429');
  });
});

describe('distance helpers', () => {
  it('mirrors the server haversine math', () => {
    expect(haversineKm(null, 0, 1, 1)).toBeNull();
    expect(haversineKm(36.0, 3.0, 37.0, 3.0)).toBeGreaterThan(110);
    expect(haversineKm(36.0, 3.0, 37.0, 3.0)).toBeLessThan(113);
    expect(haversineKm(36.0, 3.0, 36.0, 3.0)).toBe(0);
  });

  it('builds OSM directions deep links', () => {
    expect(osmDirectionsUrl({ latitude: null, longitude: 0 }, { latitude: 1, longitude: 2 })).toBeNull();
    expect(osmDirectionsUrl({ latitude: 35.7, longitude: -0.63 }, { latitude: 36.7, longitude: 3.06 })).toBe(
      'https://www.openstreetmap.org/directions?from=35.7,-0.63&to=36.7,3.06#map=14/36.7/3.06',
    );
  });
});

describe('OSM fallback and capability status', () => {
  it('provides a static raster style without any credentials', () => {
    expect(osmFallbackTiles.enabled).toBe(true);
    expect(osmFallbackTiles.styleUrl()).toBeNull();
    const spec = osmFallbackTiles.styleSpec() as typeof OSM_STYLE_SPEC;
    expect(spec.version).toBe(8);
    expect((spec.sources as { osm: { type: string } }).osm.type).toBe('raster');
  });

  it('reports which capabilities are actually configured', () => {
    const withoutKey = createMapProviders({ apiKey: null });
    expect(providerCapabilityStatus(withoutKey)).toEqual({
      tiles: false,
      geocoding: false,
      autocomplete: false,
      routing: true,
      distance: true,
    });

    const configured = createMapProviders({ apiKey: 'k', language: 'ar' });
    expect(providerCapabilityStatus(configured)).toEqual({
      tiles: true,
      geocoding: true,
      autocomplete: true,
      routing: true,
      distance: true,
    });
  });
});
