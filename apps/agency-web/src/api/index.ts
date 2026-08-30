import { ApiClient, createFleetApi } from '@kavriqo/api-client';
import type { VehicleStatus } from '@kavriqo/api-client';

/**
 * API wiring: one client per session token. Base URL comes from the Vite
 * environment (VITE_API_URL), defaulting to the local API on /api/v1.
 */
export function createApi(token: string | null): ReturnType<typeof createFleetApi> {
  const client = new ApiClient({
    baseUrl: String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000'),
    tokenProvider: () => Promise.resolve(token),
  });
  return createFleetApi(client);
}

export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
  'AVAILABLE',
  'RESERVED',
  'RENTED',
  'MAINTENANCE',
  'INSPECTION',
  'ARCHIVED',
];

export function statusTone(status: VehicleStatus): 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'AVAILABLE':
      return 'success';
    case 'RESERVED':
    case 'INSPECTION':
      return 'info';
    case 'MAINTENANCE':
      return 'warning';
    case 'RENTED':
      return 'info';
    case 'ARCHIVED':
      return 'danger';
  }
}

export { ApiError } from '@kavriqo/api-client';
export type { VehicleDto, VehicleStatus } from '@kavriqo/api-client';
