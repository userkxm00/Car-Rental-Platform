import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { BranchContacts } from '../../locations/domain/branch-rules';
import type {
  PublicAgencyIdentity,
  PublicBranch,
  PublicOpeningHoursDay,
  PublicOpeningHoursException,
  PublicVehicleCategory,
  PublicVehicleDetail,
} from '../domain/agency-profile-contract';

/**
 * Public agency-profile persistence (07-D).
 *
 * Read-only queries restricted to ACTIVE marketplace-enabled tenants.
 * Only public shapes leave this repository — tenant contact data and
 * locations are deliberately reduced to the profile contract, and live
 * vehicle positions are never exposed (docs/07 privacy boundary).
 */

export interface PublicAgencyRow {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  createdAt: Date;
  defaultCurrency: string;
  defaultLocale: string;
}

export interface PublicBranchRow {
  id: string;
  name: string;
  code: string;
  timezone: string | null;
  contacts: unknown;
  location: {
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
    hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>;
    hourExceptions: Array<{ date: Date; opensAt: string | null; closesAt: string | null }>;
  };
}

export interface PublicVehicleRow {
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
    features: Array<{ featureKey: string }>;
  };
  images: Array<{ id: string; position: number; isPrimary: boolean; contentType: string }>;
  currentBranch: PublicBranchRow | null;
}

const LOCATION_NESTED = {
  select: {
    id: true,
    name: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    region: true,
    postalCode: true,
    countryCode: true,
    latitude: true,
    longitude: true,
    hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
    hourExceptions: { select: { date: true, opensAt: true, closesAt: true } },
  },
} satisfies { select: Prisma.LocationSelect };

const BRANCH_SELECT = {
  id: true,
  name: true,
  code: true,
  timezone: true,
  contacts: true,
  location: LOCATION_NESTED,
} satisfies Prisma.BranchSelect;

@Injectable()
export class AgencyProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 07-D01: only ACTIVE marketplace-enabled agencies have public profiles. */
  async findPublicAgency(slug: string): Promise<PublicAgencyRow | null> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, status: 'ACTIVE', marketplaceEnabled: true },
      select: {
        id: true,
        name: true,
        slug: true,
        legalName: true,
        verificationStatus: true,
        createdAt: true,
        defaultCurrency: true,
        defaultLocale: true,
      },
    });
    if (!tenant) {
      return null;
    }
    return tenant;
  }

  /** 07-D03: active branches with location, hours and contacts. */
  async listPublicBranches(tenantId: string): Promise<PublicBranchRow[]> {
    return this.prisma.branch.findMany({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: BRANCH_SELECT,
    });
  }

  /** 07-D01 stats: bookable fleet size (AVAILABLE vehicles). */
  async countFleet(tenantId: string): Promise<number> {
    return this.prisma.vehicle.count({ where: { tenantId, status: 'AVAILABLE' } });
  }

  /** 07-D05: the agency's active deposit policies (profile-level summary). */
  async listActiveDepositPolicies(
    tenantId: string,
  ): Promise<Array<{ name: string; depositType: 'FIXED_MINOR' | 'PERCENT_OF_TOTAL'; valueMinor: number }>> {
    return this.prisma.depositPolicy.findMany({
      where: { tenantId, active: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { name: true, depositType: true, valueMinor: true },
    });
  }

  /** 07-D08/07-D09: a single bookable vehicle of the agency, full detail. */
  async findPublicVehicle(tenantId: string, vehicleId: string): Promise<PublicVehicleRow | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, status: 'AVAILABLE' },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        category: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            nameFr: true,
            description: true,
            descriptionAr: true,
            descriptionFr: true,
            transmission: true,
            fuelType: true,
            seats: true,
            features: { select: { featureKey: true }, orderBy: { featureKey: 'asc' } },
          },
        },
        images: {
          select: { id: true, position: true, isPrimary: true, contentType: true },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        },
        currentBranch: {
          select: {
            id: true,
            name: true,
            code: true,
            timezone: true,
            contacts: true,
            location: LOCATION_NESTED,
          },
        },
      },
    });
    if (!vehicle) {
      return null;
    }
    return vehicle;
  }

  /** 07-D10: ownership check for public signed image URLs. */
  async findPublicVehicleImage(
    tenantId: string,
    vehicleId: string,
    imageId: string,
  ): Promise<{ id: string; vehicleId: string } | null> {
    const image = await this.prisma.vehicleImage.findFirst({
      where: { id: imageId, vehicle: { id: vehicleId, tenantId, status: 'AVAILABLE' } },
      select: { id: true, vehicleId: true },
    });
    return image;
  }
}

/** Render a repository row into the public branch contract. */
export function toPublicBranch(row: PublicBranchRow): PublicBranch {
  const rawContacts: unknown = row.contacts;
  const contacts: BranchContacts =
    typeof rawContacts === 'object' && rawContacts !== null && !Array.isArray(rawContacts) ? rawContacts : {};
  const regular: PublicOpeningHoursDay[] = row.location.hours
    .map((day) => ({ dayOfWeek: day.dayOfWeek, opensAt: day.opensAt, closesAt: day.closesAt }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const exceptions: PublicOpeningHoursException[] = row.location.hourExceptions
    .map((exception) => ({
      date: exception.date.toISOString().slice(0, 10),
      opensAt: exception.opensAt,
      closesAt: exception.closesAt,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    timezone: row.timezone,
    contacts: {
      phone: typeof contacts.phone === 'string' ? contacts.phone : undefined,
      email: typeof contacts.email === 'string' ? contacts.email : undefined,
      whatsapp: typeof contacts.whatsapp === 'string' ? contacts.whatsapp : undefined,
      notes: typeof contacts.notes === 'string' ? contacts.notes : undefined,
    },
    location: row.location,
    hours: { regular, exceptions },
  };
}

export function toPublicAgencyIdentity(row: PublicAgencyRow): PublicAgencyIdentity {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    legalName: row.legalName,
    verificationStatus: row.verificationStatus,
    establishedAt: row.createdAt.toISOString(),
    defaultCurrency: row.defaultCurrency,
    defaultLocale: row.defaultLocale,
  };
}

export function toPublicVehicleDetail(row: PublicVehicleRow): PublicVehicleDetail {
  const category: PublicVehicleCategory = {
    id: row.category.id,
    name: row.category.name,
    nameAr: row.category.nameAr,
    nameFr: row.category.nameFr,
    description: row.category.description,
    descriptionAr: row.category.descriptionAr,
    descriptionFr: row.category.descriptionFr,
    transmission: row.category.transmission,
    fuelType: row.category.fuelType,
    seats: row.category.seats,
    features: row.category.features.map((feature) => feature.featureKey),
  };
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    category,
    gallery: row.images.map((image) => ({
      id: image.id,
      position: image.position,
      isPrimary: image.isPrimary,
      contentType: image.contentType,
    })),
    pickupBranch: row.currentBranch ? toPublicBranch(row.currentBranch) : null,
  };
}
