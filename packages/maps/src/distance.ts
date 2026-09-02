/**
 * Straight-line distance (R1 boundary: haversine until PostGIS-backed
 * spatial queries land with the delivery-zone work). Mirrors the server
 * implementation in apps/api/src/pricing/domain/commercial-rules.ts so
 * client- and server-reported distances agree.
 */

const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(
  lat1: number | null,
  lng1: number | null,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) {
    return null;
  }
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const sinLat = Math.sin(latDelta / 2);
  const sinLng = Math.sin(lngDelta / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Provider-independent directions deep link (07-C10): OSM web directions,
 * no API key involved. R1 keeps routing behind the provider interface;
 * the OSM link is the free baseline implementation.
 */
export function osmDirectionsUrl(
  from: { latitude: number | null; longitude: number | null },
  to: { latitude: number; longitude: number },
): string | null {
  if (from.latitude === null || from.longitude === null) {
    return null;
  }
  const fromParam = `${from.latitude},${from.longitude}`;
  const toParam = `${to.latitude},${to.longitude}`;
  return `https://www.openstreetmap.org/directions?from=${fromParam}&to=${toParam}#map=14/${to.latitude}/${to.longitude}`;
}
