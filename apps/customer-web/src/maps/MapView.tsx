import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Map, NavigationControl, Popup } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { osmDirectionsUrl } from '@kavriqo/maps';
import type { MapTilesProvider } from '@kavriqo/maps';
import type { MarkerFeature, Viewport } from '../search/query-state';
import { toGeoJson } from '../search/query-state';

/**
 * Thin imperative MapLibre projection (07-C01/07-C02/07-C05/07-C06).
 * Everything domain-level lives in `query-state.ts`; this component only
 * renders pins/clusters and reports viewport changes back up.
 */

const CLUSTER_SOURCE_ID = 'kavriqo-markers';

export interface MapViewProps {
  tiles: MapTilesProvider;
  viewport: Viewport | null;
  markers: MarkerFeature[];
  selectedOfferIndex: number | null;
  /** User coordinates (geolocation consent) — enables directions links. */
  userLocation: { latitude: number; longitude: number } | null;
  onViewportChange: (viewport: Viewport) => void;
  onMarkerSelect: (feature: MarkerFeature | null) => void;
}

interface MarkerProperties {
  id: string;
  kind: 'offer' | 'location';
  title: string;
  city: string | null;
  agencyName: string;
  offerIndex: number | null;
  priceMinor: number | null;
  distanceKm: number | null;
}

function viewportOfMap(map: Map): Viewport {
  const bounds = map.getBounds();
  const center = map.getCenter();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
    centerLat: center.lat,
    centerLng: center.lng,
  };
}

function markerOfFeature(feature: MapGeoJSONFeatureLike): MarkerFeature | null {
  const properties = feature.properties as Partial<MarkerProperties> | undefined;
  if (!properties || typeof properties.id !== 'string') {
    return null;
  }
  const coordinates = pointCoordinates(feature);
  if (!coordinates) {
    return null;
  }
  return {
    id: properties.id,
    latitude: coordinates[1],
    longitude: coordinates[0],
    kind: properties.kind === 'location' ? 'location' : 'offer',
    title: typeof properties.title === 'string' ? properties.title : '',
    city: typeof properties.city === 'string' ? properties.city : null,
    agencyName: typeof properties.agencyName === 'string' ? properties.agencyName : '',
    offerIndex: typeof properties.offerIndex === 'number' ? properties.offerIndex : null,
    priceMinor: typeof properties.priceMinor === 'number' ? properties.priceMinor : null,
    distanceKm: typeof properties.distanceKm === 'number' ? properties.distanceKm : null,
  };
}

interface MapGeoJSONFeatureLike {
  geometry: { type?: unknown } | null;
  properties: unknown;
}

function pointCoordinates(feature: MapGeoJSONFeatureLike): [number, number] | null {
  if (feature.geometry === null || feature.geometry.type !== 'Point') {
    return null;
  }
  const coordinates = (feature.geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }
  const [longitude, latitude] = coordinates as [unknown, unknown];
  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    return null;
  }
  return [longitude, latitude];
}

function priceLabel(feature: MarkerFeature): string {
  return feature.priceMinor === null ? '' : `${Math.round(feature.priceMinor / 100).toLocaleString()} DZD`;
}

export function MapView({
  tiles,
  viewport,
  markers,
  selectedOfferIndex,
  userLocation,
  onViewportChange,
  onMarkerSelect,
}: MapViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const lastAppliedViewportRef = useRef<Viewport | null>(null);
  const suppressMoveEndRef = useRef(false);
  const markersRef = useRef<MarkerFeature[]>([]);
  const tRef = useRef<TFunction>(t);
  const userLocationRef = useRef<MapViewProps['userLocation']>(userLocation);
  const [ready, setReady] = useState(false);
  markersRef.current = markers;
  tRef.current = t;
  userLocationRef.current = userLocation;

  function openPopup(feature: MarkerFeature): void {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    popupRef.current?.remove();
    popupRef.current = new Popup({ offset: 14 })
      .setLngLat([feature.longitude, feature.latitude])
      .setHTML(popupHtml(feature, tRef.current, userLocationRef.current))
      .addTo(map);
  }

  // Mount once: style from the tiles provider (URL or static fallback).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const style = tiles.styleUrl() ?? (tiles.styleSpec() as StyleSpecification);
    const map = new Map({
      container,
      style,
      center: [2.5, 28.2], // Algeria centroid until results/viewport arrive
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('moveend', () => {
      if (suppressMoveEndRef.current) {
        suppressMoveEndRef.current = false;
        return;
      }
      onViewportChange(viewportOfMap(map));
    });
    map.on('click', CLUSTER_SOURCE_ID, (event) => {
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }
      const clusterId: unknown = feature.properties?.cluster_id;
      if (typeof clusterId === 'number') {
        const source = map.getSource<GeoJSONSource>(CLUSTER_SOURCE_ID);
        const coordinates = pointCoordinates(feature);
        if (!coordinates) {
          return;
        }
        if (source) {
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: coordinates, zoom: Math.min(zoom + 1, 14) });
          });
        }
        return;
      }
      const marker = markerOfFeature(feature);
      if (marker) {
        openPopup(marker);
        onMarkerSelect(marker);
      }
    });
    map.on('mouseenter', CLUSTER_SOURCE_ID, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTER_SOURCE_ID, () => {
      map.getCanvas().style.cursor = '';
    });
    mapRef.current = map;
    setReady(true);
    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Keep the marker source/layers in sync with state (07-C06 clustering).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const source = map.getSource<GeoJSONSource>(CLUSTER_SOURCE_ID);
    const data = toGeoJson(markers);
    if (!source) {
      map.addSource(CLUSTER_SOURCE_ID, {
        type: 'geojson',
        data,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
      });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0f6b4f',
          'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'kind'], 'offer', '#e8a13c', '#0f6b4f'],
          'circle-radius': 9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    } else {
      void source.setData(data);
    }
  }, [markers, ready]);

  // External viewport application (results loaded / selection) — skip
  // when the map already matches, so user pans aren't reverted.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !viewport) {
      return;
    }
    const previous = lastAppliedViewportRef.current;
    if (previous === viewport) {
      return;
    }
    const current = viewportOfMap(map);
    const tolerance = 0.001;
    const matches =
      Math.abs(current.west - viewport.west) < tolerance &&
      Math.abs(current.east - viewport.east) < tolerance &&
      Math.abs(current.south - viewport.south) < tolerance &&
      Math.abs(current.north - viewport.north) < tolerance;
    if (!matches) {
      suppressMoveEndRef.current = true;
      map.fitBounds(
        [
          [viewport.west, viewport.south],
          [viewport.east, viewport.north],
        ],
        { padding: 40, duration: 500 },
      );
    }
    lastAppliedViewportRef.current = viewport;
  }, [viewport, ready]);

  // Selection from the list side: open the matching popup (07-C07).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || selectedOfferIndex === null) {
      return;
    }
    const marker = markersRef.current.find((candidate) => candidate.offerIndex === selectedOfferIndex);
    if (!marker) {
      return;
    }
    map.easeTo({ center: [marker.longitude, marker.latitude], duration: 400 });
    openPopup(marker);
  }, [selectedOfferIndex, ready]);

  return <div ref={containerRef} className="kv-map" data-testid="map-container" aria-label={t('search.map')} />;
}

function popupHtml(
  marker: MarkerFeature,
  t: TFunction,
  userLocation: { latitude: number; longitude: number } | null,
): string {
  const lines: string[] = [
    `<div class="kv-map-popup">`,
    `<strong>${escapeHtml(marker.title)}</strong>`,
    `<div>${escapeHtml(marker.agencyName)}${marker.city ? ` · ${escapeHtml(marker.city)}` : ''}</div>`,
  ];
  if (marker.distanceKm !== null) {
    lines.push(`<div>${escapeHtml(t('search.distanceKm', { distance: Math.round(marker.distanceKm) }))}</div>`);
  }
  if (marker.priceMinor !== null) {
    lines.push(`<div class="kv-map-popup__price">${escapeHtml(priceLabel(marker))}</div>`);
  }
  const directions = userLocation
    ? osmDirectionsUrl(userLocation, { latitude: marker.latitude, longitude: marker.longitude })
    : null;
  if (directions) {
    lines.push(
      `<a href="${directions}" target="_blank" rel="noreferrer">${escapeHtml(t('search.directions'))}</a>`,
    );
  }
  lines.push(`</div>`);
  return lines.join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
