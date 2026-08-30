import { ApiClient } from '../client';

/**
 * Typed fleet endpoints (PHASE-03). Mirrors the backend contracts in
 * apps/api/src/fleet/presentation/*.controller.ts.
 */

export type VehicleStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'RENTED'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'ARCHIVED';

export interface VehicleCategoryDto {
  id: string;
  agencyId: string;
  code: string;
  name: string;
  nameAr: string | null;
  nameFr: string | null;
  description: string | null;
  descriptionAr: string | null;
  descriptionFr: string | null;
  transmission: string | null;
  fuelType: string | null;
  seats: number | null;
  doors: number | null;
  luggageCapacity: number | null;
  active: boolean;
  features: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDto {
  id: string;
  agencyId: string;
  categoryId: string;
  currentBranchId: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  vin: string | null;
  color: string | null;
  status: VehicleStatus;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleImageDto {
  id: string;
  vehicleId: string;
  contentType: string;
  sizeBytes: number;
  position: number;
  isPrimary: boolean;
  createdAt: string;
}

export interface VehicleDocumentDto {
  id: string;
  vehicleId: string;
  type: string;
  title: string;
  contentType: string;
  sizeBytes: number;
  issuedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
}

export function createFleetApi(client: ApiClient): {
  categories: {
    list: (agencyId: string, activeOnly?: boolean) => Promise<{ categories: VehicleCategoryDto[] }>;
  };
  vehicles: {
    list: (
      agencyId: string,
      filters?: { categoryId?: string; status?: VehicleStatus; branchId?: string; search?: string },
    ) => Promise<{ vehicles: VehicleDto[] }>;
    get: (agencyId: string, vehicleId: string) => Promise<VehicleDto>;
    create: (agencyId: string, input: Partial<VehicleDto> & { categoryId: string }) => Promise<VehicleDto>;
    update: (agencyId: string, vehicleId: string, input: Partial<VehicleDto>) => Promise<VehicleDto>;
    setStatus: (agencyId: string, vehicleId: string, status: VehicleStatus) => Promise<VehicleDto>;
    images: {
      list: (agencyId: string, vehicleId: string) => Promise<{ images: VehicleImageDto[] }>;
      upload: (agencyId: string, vehicleId: string, file: File) => Promise<VehicleImageDto>;
      setPrimary: (agencyId: string, vehicleId: string, imageId: string) => Promise<{ images: VehicleImageDto[] }>;
      remove: (agencyId: string, vehicleId: string, imageId: string) => Promise<{ deleted: boolean }>;
    };
    documents: {
      list: (agencyId: string, vehicleId: string) => Promise<{ documents: VehicleDocumentDto[] }>;
    };
  };
} {
  return {
    categories: {
      list: (agencyId, activeOnly = true) =>
        client.get(`/api/v1/agencies/${agencyId}/categories`, { query: { activeOnly: String(activeOnly) } }),
    },
    vehicles: {
      list: (agencyId, filters = {}) =>
        client.get(`/api/v1/agencies/${agencyId}/vehicles`, {
          query: {
            categoryId: filters.categoryId,
            status: filters.status,
            branchId: filters.branchId,
            search: filters.search,
          },
        }),
      get: (agencyId, vehicleId) => client.get(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}`),
      create: (agencyId, input) => client.post(`/api/v1/agencies/${agencyId}/vehicles`, input),
      update: (agencyId, vehicleId, input) =>
        client.patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}`, input),
      setStatus: (agencyId, vehicleId, status) =>
        client.patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/status`, { status }),
      images: {
        list: (agencyId, vehicleId) =>
          client.get(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/images`),
        upload: (agencyId, vehicleId, file) => {
          const form = new FormData();
          form.append('file', file);
          return client.post(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/images`, form, {
            headers: { 'content-type': 'multipart/form-data' },
          });
        },
        setPrimary: (agencyId, vehicleId, imageId) =>
          client.patch(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/images/${imageId}/primary`),
        remove: (agencyId, vehicleId, imageId) =>
          client.delete(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/images/${imageId}`),
      },
      documents: {
        list: (agencyId, vehicleId) =>
          client.get(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/documents`),
      },
    },
  };
}
