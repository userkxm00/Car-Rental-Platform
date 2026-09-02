import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AvailabilityService } from '../../availability/application/availability.service';
import {
  QUOTE_PRICING_NOT_CONFIGURED_CODE,
  QUOTE_PRICING_PORT,
  QuotePricingPort,
} from '../../quotes/application/ports/quote-pricing.port';
import type { QuotePricingPayload } from '../../quotes/domain/quote-contract';
import {
  MarketplaceBranchLocation,
  SearchErrorCode,
  SearchLocationsResponse,
  SearchOffer,
  SearchOffersQuery,
  SearchOffersResponse,
} from '../domain/search-contract';
import {
  compareOffers,
  matchesFeatures,
  nearestByDistance,
  offerDistanceKm,
  parseSearchQuery,
  ParsedSearchQuery,
  withinBbox,
  withinPriceRange,
  withinRadiusKm,
} from '../domain/search-rules';
import { MarketplaceRepository, OfferBranchRow, OfferVehicleRow } from '../infrastructure/marketplace.repository';

/**
 * Cross-agency marketplace search (07-B).
 *
 * The offer pipeline per participating agency: resolve the pickup branch
 * (07-B02) → availability-eligible vehicles for the interval (07-B08) →
 * server-computed pricing (07-B05; unpriced vehicles are excluded) →
 * filters (07-B04…B07) → deterministic sort + pagination (07-B10).
 *
 * The search is public: only the offer shape (docs/40 marketplace
 * boundaries) ever leaves this service, and every tenant-scoped read goes
 * through the tenant's own availability engine.
 */

@Injectable()
export class SearchService {
  constructor(
    private readonly repository: MarketplaceRepository,
    private readonly availability: AvailabilityService,
    @Inject(QUOTE_PRICING_PORT)
    private readonly pricing?: QuotePricingPort,
  ) {}

  async searchOffers(query: SearchOffersQuery, now: Date): Promise<SearchOffersResponse> {
    const parsed = this.parse(query, now);
    const agencies = await this.repository.listEnabledAgencies(parsed.agencyId);

    const candidates: Array<{
      offer: SearchOffer;
      totalMinor: number;
      distanceKm: number | null;
      agencyName: string;
      vehicleId: string;
    }> = [];

    for (const agency of agencies) {
      // 07-B02: an agency without a matching pickup point is not serving
      // this request — skip it entirely.
      let pickupBranch: OfferBranchRow | null = null;
      if (parsed.pickupLocationId) {
        pickupBranch = (await this.repository.findBranchAtLocation(agency.id, parsed.pickupLocationId)) ?? null;
        if (!pickupBranch) {
          continue;
        }
      } else if (parsed.pickupCity) {
        const branches = await this.repository.findBranchesByCity(agency.id, parsed.pickupCity);
        // 07-C09: with coordinates present, pin the closest matching
        // pickup point (map/list parity) instead of an arbitrary one.
        pickupBranch =
          (parsed.lat !== null
            ? nearestByDistance(branches, parsed.lat, parsed.lng, (branch) => branch.location)
            : (branches[0] ?? null)) ?? null;
        if (!pickupBranch) {
          continue;
        }
      }

      // 07-B08: the agency's own availability engine decides which vehicles
      // are actually bookable for the interval + pickup context.
      const available = await this.availability.listAvailableVehicles(
        agency.id,
        { start: parsed.start, end: parsed.end },
        { pickupBranchId: pickupBranch?.id },
        { categoryId: parsed.categoryId ?? undefined },
      );
      if (available.vehicles.length === 0) {
        continue;
      }

      const rows = await this.repository.listOfferVehicles(
        agency.id,
        available.vehicles.map((vehicle) => vehicle.id),
        pickupBranch?.id ?? null,
        parsed.categoryId,
      );

      for (const row of rows) {
        // 07-D09: single-vehicle offer detail reuses the full eligibility
        // pipeline (availability, blocks, pricing) with a hard row filter.
        if (parsed.vehicleId !== null && row.id !== parsed.vehicleId) {
          continue;
        }
        const pricing = await this.priceOffer(agency.id, row, parsed, pickupBranch);
        if (!pricing) {
          continue;
        }
        const branchLat = pickupBranch?.location.latitude ?? row.currentBranch?.location.latitude ?? null;
        const branchLng = pickupBranch?.location.longitude ?? row.currentBranch?.location.longitude ?? null;
        const distanceKm = offerDistanceKm(parsed.lat, parsed.lng, branchLat, branchLng);
        // 07-C09: spatial proximity — offers whose pickup point cannot be
        // proven inside the radius/viewport fail closed.
        if (!withinRadiusKm(distanceKm, parsed.radiusKm)) {
          continue;
        }
        if (!withinBbox(branchLat, branchLng, parsed.bbox)) {
          continue;
        }
        if (!withinPriceRange(pricing.totalMinor, parsed.priceMinMinor, parsed.priceMaxMinor)) {
          continue;
        }
        if (!matchesFeatures(row.category.features.map((f) => f.featureKey), parsed.features)) {
          continue;
        }
        // 07-B04/B06: category attribute filters (exact match; null values
        // never match a requested value).
        if (parsed.transmission && row.category.transmission !== parsed.transmission) {
          continue;
        }
        if (parsed.fuelType && row.category.fuelType !== parsed.fuelType) {
          continue;
        }
        if (parsed.seats !== null && row.category.seats !== parsed.seats) {
          continue;
        }
        candidates.push({
          offer: this.toOffer(agency.id, agency.name, agency.slug, row, pickupBranch, pricing, distanceKm),
          totalMinor: pricing.totalMinor,
          distanceKm,
          agencyName: agency.name,
          vehicleId: row.id,
        });
      }
    }

    candidates.sort((a, b) =>
      compareOffers(
        parsed.sort,
        { totalMinor: a.totalMinor, distanceKm: a.distanceKm, agencyName: a.agencyName, vehicleId: a.vehicleId },
        { totalMinor: b.totalMinor, distanceKm: b.distanceKm, agencyName: b.agencyName, vehicleId: b.vehicleId },
      ),
    );

    const total = candidates.length;
    const offset = (parsed.page - 1) * parsed.limit;
    const items = candidates.slice(offset, offset + parsed.limit).map((candidate) => candidate.offer);

    return {
      items,
      total,
      page: parsed.page,
      limit: parsed.limit,
      sort: parsed.sort,
      filters: {
        start: parsed.start.toISOString(),
        end: parsed.end.toISOString(),
        pickupLocationId: parsed.pickupLocationId,
        pickupCity: parsed.pickupCity,
        agencyId: parsed.agencyId,
        vehicleId: parsed.vehicleId,
        categoryId: parsed.categoryId,
        transmission: parsed.transmission,
        fuelType: parsed.fuelType,
        seats: parsed.seats,
        features: parsed.features,
        priceMinMinor: parsed.priceMinMinor,
        priceMaxMinor: parsed.priceMaxMinor,
        lat: parsed.lat,
        lng: parsed.lng,
        radiusKm: parsed.radiusKm,
        bbox: parsed.bbox,
      },
    };
  }

  /**
   * 07-C05/07-C06: map markers for the marketplace — the pickup points of
   * participating agencies (branches/parking/pickup), never live vehicle
   * positions. Public and unpaginated by design: pins are clustered
   * client-side.
   */
  async listLocations(): Promise<SearchLocationsResponse> {
    const rows = await this.repository.listBranchLocations();
    const items: MarketplaceBranchLocation[] = [];
    for (const row of rows) {
      if (row.location.latitude === null || row.location.longitude === null) {
        continue;
      }
      items.push({
        branch: { id: row.id, name: row.name },
        location: {
          id: row.location.id,
          name: row.location.name,
          city: row.location.city,
          latitude: row.location.latitude,
          longitude: row.location.longitude,
        },
        agency: { id: row.tenant.id, name: row.tenant.name, slug: row.tenant.slug },
      });
    }
    return { items, total: items.length };
  }

  private parse(query: SearchOffersQuery, now: Date): ParsedSearchQuery {
    try {
      return parseSearchQuery(query ?? {}, now);
    } catch (error) {
      if (error instanceof RangeError) {
        const [code, message] = splitRuleError(error.message);
        throw new ConflictException({ code, message });
      }
      throw error;
    }
  }

  /**
   * Server-authoritative offer price for the pickup context. Unpriced
   * vehicles (no active rate plan) are never bookable-as-priced and are
   * excluded from marketplace results; unexpected pricing errors fail the
   * request loudly instead of silently dropping offers.
   */
  private async priceOffer(
    tenantId: string,
    row: OfferVehicleRow,
    parsed: ParsedSearchQuery,
    pickupBranch: OfferBranchRow | null,
  ): Promise<QuotePricingPayload | null> {
    if (!this.pricing) {
      return null;
    }
    try {
      return await this.pricing.computeQuotePricing({
        tenantId,
        mode: 'VEHICLE',
        vehicleId: row.id,
        categoryId: row.category.id,
        start: parsed.start,
        end: parsed.end,
        pickupBranchId: pickupBranch?.id ?? row.currentBranchId ?? undefined,
      });
    } catch (error) {
      if (isPricingNotConfigured(error)) {
        return null;
      }
      throw error;
    }
  }

  private toOffer(
    tenantId: string,
    agencyName: string,
    agencySlug: string,
    row: OfferVehicleRow,
    pickupBranch: OfferBranchRow | null,
    pricing: QuotePricingPayload,
    distanceKm: number | null,
  ): SearchOffer {
    const branchRow = pickupBranch ?? row.currentBranch;
    return {
      agency: { id: tenantId, name: agencyName, slug: agencySlug },
      vehicle: {
        id: row.id,
        make: row.make,
        model: row.model,
        year: row.year,
        plateNumber: row.plateNumber,
        category: {
          id: row.category.id,
          name: row.category.name,
          transmission: row.category.transmission,
          fuelType: row.category.fuelType,
          seats: row.category.seats,
          features: row.category.features.map((feature) => feature.featureKey),
        },
      },
      pickupBranch: branchRow
        ? {
            id: branchRow.id,
            name: branchRow.name,
            location: {
              id: branchRow.location.id,
              city: branchRow.location.city,
              latitude: branchRow.location.latitude,
              longitude: branchRow.location.longitude,
            },
            distanceKm,
          }
        : null,
      pricing,
    };
  }
}

function splitRuleError(message: string): [string, string] {
  const separator = message.indexOf(': ');
  if (separator === -1) {
    return [SearchErrorCode.INVALID_INTERVAL, message];
  }
  return [message.slice(0, separator), message.slice(separator + 2)];
}

function isPricingNotConfigured(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('getResponse' in error)) {
    return false;
  }
  const response = (error as { getResponse(): unknown }).getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { code?: unknown }).code === QUOTE_PRICING_NOT_CONFIGURED_CODE
  );
}
