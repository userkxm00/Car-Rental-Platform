import { MapTilesProvider } from './provider-contract';

/**
 * No-key tiles fallback: a static MapLibre style over the public OSM
 * raster tiles. Lets dev/demo environments render a real map without
 * any provider credentials while the MapTiler adapter stays the
 * configured path for production (ADR-001).
 */

const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export const OSM_STYLE_SPEC = {
  version: 8,
  name: 'KAVRIQO OSM raster fallback',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
} as const;

export const osmFallbackTiles: MapTilesProvider = {
  enabled: true,
  styleUrl: () => null,
  styleSpec: () => OSM_STYLE_SPEC,
  attribution: OSM_ATTRIBUTION,
};
