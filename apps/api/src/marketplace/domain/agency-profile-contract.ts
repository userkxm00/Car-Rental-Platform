import type { BranchContacts } from '../../locations/domain/branch-rules';
import type { QuotePricingPayload } from '../../quotes/domain/quote-contract';
import type { OfferBranch } from '../../search/domain/search-contract';

/**
 * Public agency-profile contract (07-D).
 *
 * The marketplace profile surface is public and read-only: only
 * participating agencies (ACTIVE + marketplaceEnabled) are visible, and
 * every field is derived from authoritative platform data (docs/40,
 * docs/42 — never manufacture trust signals). No membership applies.
 */

export const AgencyProfileErrorCode = {
  AGENCY_NOT_FOUND: 'AGENCY_NOT_FOUND',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  IMAGE_NOT_FOUND: 'IMAGE_NOT_FOUND',
} as const;

export type AgencyProfileErrorCodeValue = (typeof AgencyProfileErrorCode)[keyof typeof AgencyProfileErrorCode];

/** 07-D02: verification badge is the tenant's authoritative status. */
export type PublicVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

/**
 * 07-D07: rating summary placeholder until PHASE-19 (reviews & trust).
 * Reviews do not exist yet, so the profile honestly reports the neutral
 * "new agency" state instead of manufacturing a score (docs/42).
 */
export interface AgencyRatingSummary {
  state: 'NEW';
  averageRating: number | null;
  reviewCount: number;
}

export interface DepositPolicySummary {
  name: string;
  depositType: 'FIXED_MINOR' | 'PERCENT_OF_TOTAL';
  valueMinor: number;
}

export interface PublicAgencyIdentity {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  verificationStatus: PublicVerificationStatus;
  /** Profile established date — factual badge (docs/42 trust signals). */
  establishedAt: string;
  defaultCurrency: string;
  defaultLocale: string;
}

export interface AgencyProfileResponse {
  agency: PublicAgencyIdentity;
  /** Distinct cities covered by the agency's active branches. */
  serviceAreas: string[];
  stats: {
    branchCount: number;
    fleetCount: number;
  };
  /** 07-D07: neutral NEW state — reviews land in PHASE-19. */
  ratingSummary: AgencyRatingSummary;
  /** 07-D05: active deposit policies (the R1 profile-level policy data). */
  depositPolicies: DepositPolicySummary[];
}

export interface PublicLocationSummary {
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

export interface PublicOpeningHoursDay {
  /** ISO-8601 day numbering: 0=Monday … 6=Sunday. */
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
}

export interface PublicOpeningHoursException {
  date: string;
  /** Both null = closed all day (02-C05). */
  opensAt: string | null;
  closesAt: string | null;
}

export interface PublicBranch {
  id: string;
  name: string;
  code: string;
  timezone: string | null;
  /** 07-D06: validated contact methods (phone/email/whatsapp/notes). */
  contacts: BranchContacts;
  location: PublicLocationSummary;
  /** 07-D04: recurring + exception opening hours of the branch location. */
  hours: {
    regular: PublicOpeningHoursDay[];
    exceptions: PublicOpeningHoursException[];
  };
}

export interface AgencyBranchesResponse {
  items: PublicBranch[];
  total: number;
}

export interface PublicVehicleGalleryImage {
  id: string;
  position: number;
  isPrimary: boolean;
  contentType: string;
}

export interface PublicVehicleCategory {
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
}

export interface PublicVehicleDetail {
  id: string;
  make: string;
  model: string;
  year: number;
  category: PublicVehicleCategory;
  /** 07-D10: structured gallery metadata — content via signed image URLs. */
  gallery: PublicVehicleGalleryImage[];
  pickupBranch: PublicBranch | null;
}

/**
 * 07-D09: vehicle offer detail. `offer` carries the full bookability
 * pipeline result (availability + pricing + pickup context) for the
 * requested interval — null when the vehicle is not bookable as priced.
 */
export interface VehicleDetailResponse {
  vehicle: PublicVehicleDetail;
  offer: {
    pickupBranch: OfferBranch | null;
    pricing: QuotePricingPayload;
  } | null;
}

export interface PublicImageUrlResponse {
  url: string;
  expiresAt: string;
}
