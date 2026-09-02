import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AgencySummary, OfferBranch } from '../domain/search-contract';

/**
 * Marketplace search persistence (07-B).
 *
 * Read-only cross-agency queries for the public discovery surface. Only
 * ACTIVE marketplace-enabled tenants participate (07-B07); every row type
 * is reduced to the public offer shape — nothing agency-private is ever
 * selected.
 */

export interface OfferBranchRow {
  id: string;
  name: string;
  location: {
    id: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

export interface OfferVehicleRow {
  id: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  currentBranchId: string | null;
  category: {
    id: string;
    name: string;
    transmission: string | null;
    fuelType: string | null;
    seats: number | null;
    features: Array<{ featureKey: string }>;
  };
  currentBranch: OfferBranchRow | null;
}

const AGENCY_SELECT = {
  id: true,
  name: true,
  slug: true,
} satisfies Prisma.TenantSelect;

const BRANCH_SELECT = {
  id: true,
  name: true,
  location: { select: { id: true, city: true, latitude: true, longitude: true } },
} satisfies Prisma.BranchSelect;

const BRANCH_NESTED = { select: BRANCH_SELECT } satisfies { select: Prisma.BranchSelect };

@Injectable()
export class MarketplaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 07-B07: participating agencies — ACTIVE + marketplace-enabled. */
  async listEnabledAgencies(agencyId: string | null): Promise<AgencySummary[]> {
    const where: Prisma.TenantWhereInput = {
      status: 'ACTIVE',
      marketplaceEnabled: true,
    };
    if (agencyId) {
      where.id = agencyId;
    }
    return this.prisma.tenant.findMany({
      where,
      select: AGENCY_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /** ACTIVE branch of an agency at an exact location id (07-B02). */
  async findBranchAtLocation(tenantId: string, locationId: string): Promise<OfferBranchRow | undefined> {
    const branch = await this.prisma.branch.findFirst({
      where: { tenantId, locationId, status: 'ACTIVE' },
      select: BRANCH_SELECT,
    });
    return branch ?? undefined;
  }

  /** ACTIVE branches of an agency whose location matches the city text. */
  async findBranchesByCity(tenantId: string, city: string): Promise<OfferBranchRow[]> {
    return this.prisma.branch.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [
          { location: { city: { contains: city, mode: 'insensitive' } } },
          { location: { name: { contains: city, mode: 'insensitive' } } },
        ],
      },
      select: BRANCH_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Full public vehicle rows for the availability-eligible candidates.
   * The `status = AVAILABLE` predicate is the marketplace's own addition
   * (the availability engine excludes conflicts, not fleet status) and the
   * `currentBranchId` predicate mirrors the availability context.
   */
  async listOfferVehicles(
    tenantId: string,
    vehicleIds: string[],
    pickupBranchId: string | null,
    categoryId: string | null,
  ): Promise<OfferVehicleRow[]> {
    if (vehicleIds.length === 0) {
      return [];
    }
    const where: Prisma.VehicleWhereInput = {
      tenantId,
      id: { in: vehicleIds },
      status: 'AVAILABLE',
    };
    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (pickupBranchId) {
      where.currentBranchId = pickupBranchId;
    }
    return this.prisma.vehicle.findMany({
      where,
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        plateNumber: true,
        currentBranchId: true,
        category: {
          select: {
            id: true,
            name: true,
            transmission: true,
            fuelType: true,
            seats: true,
            features: { select: { featureKey: true } },
          },
        },
        currentBranch: BRANCH_NESTED,
      },
      orderBy: [{ make: 'asc' }, { model: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 07-C05/07-C06: public pickup-point feed for marketplace map markers.
   * Only ACTIVE branches of participating agencies, only rows with real
   * coordinates (pins without coordinates are meaningless) — and nothing
   * else. Privacy boundary: pickup locations, never vehicle positions.
   */
  async listBranchLocations(): Promise<MarketplaceBranchLocationRow[]> {
    return this.prisma.branch.findMany({
      where: {
        status: 'ACTIVE',
        location: { latitude: { not: null }, longitude: { not: null } },
        tenant: { status: 'ACTIVE', marketplaceEnabled: true },
      },
      select: {
        id: true,
        name: true,
        location: {
          select: { id: true, name: true, city: true, latitude: true, longitude: true },
        },
        tenant: { select: AGENCY_SELECT },
      },
      orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  /** The resolved pickup branch row for an agency under a city filter. */
  toOfferBranch(row: OfferBranchRow): OfferBranch {
    return {
      id: row.id,
      name: row.name,
      location: {
        id: row.location.id,
        city: row.location.city,
        latitude: row.location.latitude,
        longitude: row.location.longitude,
      },
      distanceKm: null,
    };
  }
}

export interface MarketplaceBranchLocationRow {
  id: string;
  name: string;
  location: {
    id: string;
    name: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}
