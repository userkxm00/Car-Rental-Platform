import {
  GeocodingProvider,
  GeocodingSuggestion,
  MapProviders,
  MapTilesProvider,
  RoutingProvider,
} from './provider-contract';
import { haversineKm, osmDirectionsUrl } from './distance';

/**
 * MapTiler Cloud adapter (ADR-001: the initial managed map/geocoding
 * provider, accessed only through this adapter — no SDK objects or
 * secrets leak into the domain).
 *
 * Without an API key every MapTiler capability reports `enabled: false`
 * (docs/07: "Only enable provider capabilities that are actually
 * configured"). The API key comes from the host app's environment
 * (VITE_MAPTILER_API_KEY) and is never stored in source.
 */

export interface MapTilerAdapterOptions {
  apiKey?: string | null;
  /** Locale for geocoding labels: 'ar' | 'fr' | 'en'. */
  language?: string;
  fetchImpl?: typeof fetch;
}

const MAPTILER_BASE = 'https://api.maptiler.com';
const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors';

export function createMapTilerTiles(apiKey: string | null | undefined): MapTilesProvider {
  const enabled = Boolean(apiKey && apiKey.trim().length > 0);
  return {
    enabled,
    styleUrl: () =>
      enabled
        ? `${MAPTILER_BASE}/maps/streets-v2/style.json?key=${encodeURIComponent((apiKey as string).trim())}`
        : null,
    styleSpec: () => null,
    attribution: MAPTILER_ATTRIBUTION,
  };
}

function normalizeLanguage(language: string | undefined): string {
  if (language === 'ar' || language === 'fr' || language === 'en') {
    return language;
  }
  return 'en';
}

interface MapTilerFeature {
  place_name?: unknown;
  center?: unknown;
  place_type?: unknown;
  text?: unknown;
  properties?: { country_code?: unknown; locality?: unknown };
}

function toSuggestion(feature: MapTilerFeature): GeocodingSuggestion | null {
  const center = feature.center;
  if (!Array.isArray(center) || center.length < 2) {
    return null;
  }
  const [longitude, latitude] = center as [unknown, unknown];
  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    return null;
  }
  const kinds = Array.isArray(feature.place_type)
    ? feature.place_type.filter((kind): kind is string => typeof kind === 'string')
    : [];
  const label =
    typeof feature.place_name === 'string'
      ? feature.place_name
      : typeof feature.text === 'string'
        ? feature.text
        : '';
  const locality =
    feature.properties && typeof feature.properties.locality === 'string'
      ? feature.properties.locality
      : null;
  const countryCode =
    feature.properties && typeof feature.properties.country_code === 'string'
      ? feature.properties.country_code.toUpperCase()
      : null;
  return {
    label,
    name: typeof feature.text === 'string' ? feature.text : label,
    latitude,
    longitude,
    kind: kinds[0] ?? null,
    city: locality,
    countryCode,
  };
}

export function createMapTilerGeocoding(options: {
  apiKey: string | null | undefined;
  language?: string;
  fetchImpl?: typeof fetch;
}): GeocodingProvider {
  const key = options.apiKey?.trim() ?? '';
  const enabled = key.length > 0;
  const language = normalizeLanguage(options.language);
  const fetchImpl = options.fetchImpl ?? fetch;

  const query = async (text: string, parameters: string, limit: number): Promise<GeocodingSuggestion[]> => {
    const url =
      `${MAPTILER_BASE}/geocoding/${encodeURIComponent(text)}.json` +
      `?key=${encodeURIComponent(key)}&language=${language}&limit=${String(limit)}${parameters}`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`MapTiler geocoding failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { features?: MapTilerFeature[] };
    const suggestions: GeocodingSuggestion[] = [];
    for (const feature of payload.features ?? []) {
      const suggestion = toSuggestion(feature);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
    return suggestions;
  };

  return {
    enabled,
    suggest: (text, options) =>
      query(text, '&fuzzy=true', Math.min(Math.max(options?.limit ?? 6, 1), 10)),
    geocode: (text, options) => query(text, '', Math.min(Math.max(options?.limit ?? 5, 1), 10)),
  };
}

/** R1 routing: provider-independent OSM deep links (optional capability). */
export const osmRoutingProvider: RoutingProvider = {
  enabled: true,
  directionsUrl: osmDirectionsUrl,
};

/**
 * Assembles the capability set for an app. Tiles and geocoding come from
 * the chosen provider (MapTiler), distance is always the local haversine
 * mirror, routing is the OSM deep link.
 */
export function createMapProviders(options: MapTilerAdapterOptions): MapProviders {
  const tiles = createMapTilerTiles(options.apiKey);
  const geocoding = createMapTilerGeocoding({
    apiKey: options.apiKey,
    language: options.language,
    fetchImpl: options.fetchImpl,
  });
  return {
    tiles,
    geocoding,
    autocomplete: geocoding,
    routing: osmRoutingProvider,
    distance: { haversineKm },
  };
}
