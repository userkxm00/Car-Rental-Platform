import { ApiClient } from '../client';
import { searchQueryParams } from './search';
import type { SearchOffersQueryInput, SearchOffersResponseDto } from './search';

/**
 * Typed public agency-profile endpoints (PHASE-07 07-D). Mirrors
 * apps/api/src/marketplace/domain/agency-profile-contract.ts.
 */

export type PublicVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface AgencyProfileDto {
  agency: {
    id: string;
    name: string;
    slug: string;
    legalName: string | null;
    verificationStatus: PublicVerificationStatus;
    establishedAt: string;
    defaultCurrency: string;
    defaultLocale: string;
  };
  serviceAreas: string[];
  stats: { branchCount: number; fleetCount: number };
  ratingSummary: { state: 'NEW'; averageRating: number | null; reviewCount: number };
  depositPolicies: Array<{
    name: string;
    depositType: 'FIXED_MINOR' | 'PERCENT_OF_TOTAL';
    valueMinor: number;
  }>;
}

export interface PublicLocationSummaryDto {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
}

export interface PublicBranchDto {
  id: string;
  name: string;
  code: string;
  timezone: string | null;
  contacts: { phone?: string; email?: string; whatsapp?: string; notes?: string };
  location: PublicLocationSummaryDto;
  hours: {
    regular: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
    exceptions: Array<{ date: string; opensAt: string | null; closesAt: string | null }>;
  };
}

export interface AgencyBranchesResponseDto {
  items: PublicBranchDto[];
  total: number;
}

export interface PublicVehicleGalleryImageDto {
  id: string;
  position: number;
  isPrimary: boolean;
  contentType: string;
}

export interface PublicVehicleDetailDto {
  id: string;
  make: string;
  model: string;
  year: number;
  category: {
    id: string;
    name: string;
    nameAr: string | null;
    nameFr: string | null;
    description: string | null;
    descriptionAr: string | null;
    descriptionFr: string | null;
    transmission: string | null;
    fuelType: string | null;
    seats: number | null;
    features: string[];
  };
  gallery: PublicVehicleGalleryImageDto[];
  pickupBranch: PublicBranchDto | null;
}

export interface VehicleDetailResponseDto {
  vehicle: PublicVehicleDetailDto;
  offer: {
    pickupBranch: {
      id: string;
      name: string;
      location: { id: string; city: string | null; latitude: number | null; longitude: number | null };
      distanceKm: number | null;
    } | null;
    pricing: {
      currency: string;
      totalMinor: number;
      breakdown: Array<{ code: string; amountMinor: number }>;
      depositMinor: number | null;
      calculatedAt: string;
    };
  } | null;
}

export interface PublicImageUrlResponseDto {
  url: string;
  expiresAt: string;
}

export function createAgencyProfilesApi(client: ApiClient) {
  return {
    profile(slug: string): Promise<AgencyProfileDto> {
      return client.get(`/marketplace/agencies/${encodeURIComponent(slug)}`);
    },
    branches(slug: string): Promise<AgencyBranchesResponseDto> {
      return client.get(`/marketplace/agencies/${encodeURIComponent(slug)}/branches`);
    },
    fleet(slug: string, query: SearchOffersQueryInput): Promise<SearchOffersResponseDto> {
      return client.get(`/marketplace/agencies/${encodeURIComponent(slug)}/vehicles`, {
        query: searchQueryParams(query),
      });
    },
    vehicle(slug: string, vehicleId: string, query: SearchOffersQueryInput): Promise<VehicleDetailResponseDto> {
      return client.get(
        `/marketplace/agencies/${encodeURIComponent(slug)}/vehicles/${encodeURIComponent(vehicleId)}`,
        { query: searchQueryParams(query) },
      );
    },
    vehicleImageUrl(slug: string, vehicleId: string, imageId: string): Promise<PublicImageUrlResponseDto> {
      return client.get(
        `/marketplace/agencies/${encodeURIComponent(slug)}/vehicles/${encodeURIComponent(vehicleId)}/images/${encodeURIComponent(imageId)}/url`,
      );
    },
  };
}

export type AgencyProfilesApi = ReturnType<typeof createAgencyProfilesApi>;
