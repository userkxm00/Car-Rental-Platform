import { Injectable, NotFoundException } from '@nestjs/common';
import { MediaService } from '../../media/application/media.service';
import { SearchService } from '../../search/application/search.service';
import type { SearchOffersQuery, SearchOffersResponse } from '../../search/domain/search-contract';
import {
  AgencyProfileErrorCode,
  AgencyProfileResponse,
  AgencyBranchesResponse,
  PublicImageUrlResponse,
  VehicleDetailResponse,
} from '../domain/agency-profile-contract';
import {
  AgencyProfileRepository,
  toPublicAgencyIdentity,
  toPublicBranch,
  toPublicVehicleDetail,
} from '../infrastructure/agency-profile.repository';

/**
 * Public agency profiles (07-D).
 *
 * Marketplace read-only surface over participating agencies only. Profile
 * content is derived from authoritative platform data: verification badge
 * (07-D02) from the tenant's verification status, branches/hours/contacts
 * (07-D03/D04/D06) from location records, policies (07-D05) from active
 * deposit policies, rating summary (07-D07) as the honest NEW state until
 * PHASE-19 reviews, fleet (07-D08) through the full bookability pipeline,
 * and vehicle detail/gallery (07-D09/D10) from the fleet domain + media
 * service. Non-participating or unknown agencies 404 — the marketplace
 * opt-in boundary applies to profiles exactly like search (docs/40).
 */

@Injectable()
export class AgencyProfilesService {
  constructor(
    private readonly repository: AgencyProfileRepository,
    private readonly search: SearchService,
    private readonly media: MediaService,
  ) {}

  async getProfile(slug: string): Promise<AgencyProfileResponse> {
    const agency = await this.repository.findPublicAgency(slug);
    if (!agency) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.AGENCY_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    const [branches, fleetCount, depositPolicies] = await Promise.all([
      this.repository.listPublicBranches(agency.id),
      this.repository.countFleet(agency.id),
      this.repository.listActiveDepositPolicies(agency.id),
    ]);
    const serviceAreas = Array.from(
      new Set(branches.map((branch) => branch.location.city).filter((city): city is string => city !== null)),
    ).sort((a, b) => a.localeCompare(b));
    return {
      agency: toPublicAgencyIdentity(agency),
      serviceAreas,
      stats: { branchCount: branches.length, fleetCount },
      ratingSummary: { state: 'NEW', averageRating: null, reviewCount: 0 },
      depositPolicies,
    };
  }

  /** 07-D03/D04/D06: public branches with hours and contacts. */
  async listBranches(slug: string): Promise<AgencyBranchesResponse> {
    const agency = await this.repository.findPublicAgency(slug);
    if (!agency) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.AGENCY_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    const branches = await this.repository.listPublicBranches(agency.id);
    return { items: branches.map(toPublicBranch), total: branches.length };
  }

  /**
   * 07-D08: the agency's bookable fleet — the full marketplace offer
   * pipeline (availability, blocks, pricing) restricted to this agency.
   * The server forces the tenant scope; a conflicting client agencyId is
   * ignored, never honored.
   */
  async searchFleet(slug: string, query: SearchOffersQuery, now: Date): Promise<SearchOffersResponse> {
    const agency = await this.repository.findPublicAgency(slug);
    if (!agency) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.AGENCY_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    return this.search.searchOffers({ ...query, agencyId: agency.id }, now);
  }

  /** 07-D09: vehicle offer detail — specs, gallery, pickup context, pricing. */
  async getVehicle(
    slug: string,
    vehicleId: string,
    query: SearchOffersQuery,
    now: Date,
  ): Promise<VehicleDetailResponse> {
    const agency = await this.repository.findPublicAgency(slug);
    if (!agency) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.AGENCY_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    const vehicle = await this.repository.findPublicVehicle(agency.id, vehicleId);
    if (!vehicle) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.VEHICLE_NOT_FOUND,
        message: 'Vehicle not found.',
      });
    }
    // Bookability for the requested interval comes from the same pipeline
    // as marketplace search: availability engine + pricing. An empty result
    // means "exists but not bookable-as-priced right now" — offer: null.
    const response = await this.search.searchOffers({ ...query, agencyId: agency.id, vehicleId }, now);
    const offer = response.items[0] ?? null;
    return {
      vehicle: toPublicVehicleDetail(vehicle),
      offer: offer ? { pickupBranch: offer.pickupBranch, pricing: offer.pricing } : null,
    };
  }

  /** 07-D10: signed image URL — ownership verified through the agency. */
  async getVehicleImageUrl(
    slug: string,
    vehicleId: string,
    imageId: string,
  ): Promise<PublicImageUrlResponse> {
    const agency = await this.repository.findPublicAgency(slug);
    if (!agency) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.AGENCY_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    const image = await this.repository.findPublicVehicleImage(agency.id, vehicleId, imageId);
    if (!image) {
      throw new NotFoundException({
        code: AgencyProfileErrorCode.IMAGE_NOT_FOUND,
        message: 'Image not found.',
      });
    }
    const signed = await this.media.signedImageUrl(agency.id, vehicleId, imageId);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }
}
