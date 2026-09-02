import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/auth.guard';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import type { SearchOffersQuery, SearchOffersResponse } from '../../search/domain/search-contract';
import { AgencyProfilesService } from '../application/agency-profiles.service';
import {
  AgencyBranchesResponse,
  AgencyProfileResponse,
  PublicImageUrlResponse,
  VehicleDetailResponse,
} from '../domain/agency-profile-contract';

/**
 * Public agency profiles (07-D).
 *
 * `GET /api/v1/marketplace/agencies/:slug` — first-class public profiles
 * for participating agencies (docs/40): identity + verification badge,
 * branches with hours and contacts, policies, honest NEW rating state,
 * bookable fleet and vehicle offer details with signed gallery URLs.
 * Public and rate-limited like marketplace search; non-participating
 * agencies resolve to 404 AGENCY_NOT_FOUND.
 */
@Controller('marketplace/agencies')
export class AgencyProfilesController {
  constructor(private readonly service: AgencyProfilesService) {}

  /** 07-D01/D02/D05/D06/D07: agency identity, badge, policies, rating state. */
  @Get(':slug')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async profile(@Param('slug') slug: string): Promise<AgencyProfileResponse> {
    return this.service.getProfile(slug);
  }

  /** 07-D03/D04/D06: public branches, opening hours and contact methods. */
  @Get(':slug/branches')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async branches(@Param('slug') slug: string): Promise<AgencyBranchesResponse> {
    return this.service.listBranches(slug);
  }

  /** 07-D08: this agency's bookable fleet via the offer pipeline. */
  @Get(':slug/vehicles')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async fleet(
    @Param('slug') slug: string,
    @Query() query: SearchOffersQuery,
  ): Promise<SearchOffersResponse> {
    return this.service.searchFleet(slug, query ?? {}, new Date());
  }

  /** 07-D09: vehicle offer detail (specs, gallery, pickup, pricing). */
  @Get(':slug/vehicles/:vehicleId')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async vehicle(
    @Param('slug') slug: string,
    @Param('vehicleId') vehicleId: string,
    @Query() query: SearchOffersQuery,
  ): Promise<VehicleDetailResponse> {
    return this.service.getVehicle(slug, vehicleId, query ?? {}, new Date());
  }

  /** 07-D10: signed gallery image URL (ownership verified). */
  @Get(':slug/vehicles/:vehicleId/images/:imageId/url')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async imageUrl(
    @Param('slug') slug: string,
    @Param('vehicleId') vehicleId: string,
    @Param('imageId') imageId: string,
  ): Promise<PublicImageUrlResponse> {
    return this.service.getVehicleImageUrl(slug, vehicleId, imageId);
  }
}
