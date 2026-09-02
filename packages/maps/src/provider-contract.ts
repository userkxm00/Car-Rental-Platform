/**
 * Map provider abstraction (ADR-001, docs/07 — "Do not hard-code the
 * domain model to one map provider").
 *
 * The domain talks to capabilities, never to a provider SDK:
 * - tiles / rendering (MapLibre consumes a style URL or spec)
 * - geocoding (query → coordinates)
 * - address autocomplete (incremental suggestions)
 * - routing/directions (optional for R1, behind the same interface)
 * - distance (always available — straight-line haversine mirrors the
 *   server's R1 math)
 *
 * Capabilities that are not configured report `enabled: false` and the
 * UI must degrade instead of erroring (docs/07: "Only enable provider
 * capabilities that are actually configured").
 */

export interface GeocodingSuggestion {
  /** Human-readable label for autocomplete UI. */
  label: string;
  /** Primary name of the matched place. */
  name: string;
  latitude: number;
  longitude: number;
  /** Place category from the provider (locality, poi, address, …). */
  kind: string | null;
  city: string | null;
  countryCode: string | null;
}

export interface GeocodingProvider {
  readonly enabled: boolean;
  /** Incremental autocomplete suggestions (07-C04). */
  suggest(query: string, options?: { limit?: number }): Promise<GeocodingSuggestion[]>;
  /** Full geocode of a free-text place query (07-C03). */
  geocode(query: string, options?: { limit?: number }): Promise<GeocodingSuggestion[]>;
}

export interface MapTilesProvider {
  readonly enabled: boolean;
  /** MapLibre style URL, or null when a static style spec applies. */
  styleUrl(): string | null;
  /** Static MapLibre StyleSpecification (used by the no-key fallback). */
  styleSpec(): unknown;
  /** Required attribution string for the rendered map. */
  readonly attribution: string;
}

export interface RoutingProvider {
  readonly enabled: boolean;
  /**
   * Human directions for R1 are provider-independent: a deep link into
   * the OpenStreetMap directions site (no key, no SDK). Returns null
   * when either endpoint lacks coordinates.
   */
  directionsUrl(
    from: { latitude: number | null; longitude: number | null },
    to: { latitude: number; longitude: number },
  ): string | null;
}

export interface DistanceProvider {
  /** Straight-line km between two points; null without full coordinates. */
  haversineKm(
    lat1: number | null,
    lng1: number | null,
    lat2: number | null,
    lng2: number | null,
  ): number | null;
}

export interface MapProviders {
  readonly tiles: MapTilesProvider;
  readonly geocoding: GeocodingProvider;
  readonly autocomplete: GeocodingProvider;
  readonly routing: RoutingProvider;
  readonly distance: DistanceProvider;
}

export interface ProviderCapabilityStatus {
  tiles: boolean;
  geocoding: boolean;
  autocomplete: boolean;
  routing: boolean;
  distance: boolean;
}

/** Which capabilities are actually configured (docs/07). */
export function providerCapabilityStatus(providers: MapProviders): ProviderCapabilityStatus {
  return {
    tiles: providers.tiles.enabled,
    geocoding: providers.geocoding.enabled,
    autocomplete: providers.autocomplete.enabled,
    routing: providers.routing.enabled,
    distance: true,
  };
}
