import { Injectable } from '@nestjs/common';
import {
  Branch,
  BranchStatus,
  DeliveryZone,
  Location,
  LocationHourException,
  LocationHours,
  LocationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BranchContacts } from '../domain/branch-rules';

/**
 * Locations/branches persistence (02-C01…C08).
 *
 * Cross-tenant location ownership (02-C03) is enforced by the service layer
 * before any write; unique constraints (branch code per tenant, one hours row
 * per day, one exception per date) are database-enforced.
 */
@Injectable()
export class LocationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Locations (02-C02) ─────────────────────────────────────────────────

  async createLocation(input: {
    tenantId?: string;
    type: LocationType;
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    countryCode?: string;
    latitude?: number;
    longitude?: number;
    providerName?: string;
    providerPlaceId?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<Location> {
    return this.prisma.location.create({
      data: {
        tenantId: input.tenantId ?? null,
        type: input.type,
        name: input.name,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        region: input.region ?? null,
        postalCode: input.postalCode ?? null,
        countryCode: input.countryCode ?? 'DZ',
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        providerName: input.providerName ?? null,
        providerPlaceId: input.providerPlaceId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async findLocation(id: string): Promise<Location | undefined> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    return location ?? undefined;
  }

  async listLocationsForTenant(tenantId: string): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
    });
  }

  async findLocationByIdAndTenant(id: string, tenantId?: string): Promise<Location | undefined> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      return undefined;
    }
    if (tenantId === undefined) {
      return location;
    }
    return location.tenantId === tenantId || location.tenantId === null ? location : undefined;
  }

  // ── Branches (02-C01/03/06) ────────────────────────────────────────────

  async createBranch(input: {
    tenantId: string;
    name: string;
    code: string;
    locationId: string;
    timezone?: string;
    contacts?: BranchContacts;
  }): Promise<Branch> {
    return this.prisma.branch.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        code: input.code,
        locationId: input.locationId,
        status: 'ACTIVE',
        timezone: input.timezone ?? null,
        contacts:
          input.contacts === undefined ? undefined : (input.contacts as Prisma.InputJsonValue),
      },
    });
  }

  async findBranch(id: string): Promise<Branch | undefined> {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    return branch ?? undefined;
  }

  async findBranchByTenantAndCode(tenantId: string, code: string): Promise<Branch | undefined> {
    const branch = await this.prisma.branch.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
    return branch ?? undefined;
  }

  async listBranches(tenantId: string): Promise<Branch[]> {
    return this.prisma.branch.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async setBranchStatus(id: string, status: BranchStatus): Promise<Branch> {
    return this.prisma.branch.update({ where: { id }, data: { status } });
  }

  async updateBranchContacts(id: string, contacts: BranchContacts): Promise<Branch> {
    return this.prisma.branch.update({
      where: { id },
      data: { contacts: contacts as Prisma.InputJsonValue },
    });
  }

  // ── Operating hours (02-C04) ───────────────────────────────────────────

  async upsertHours(
    locationId: string,
    dayOfWeek: number,
    opensAt: string,
    closesAt: string,
  ): Promise<LocationHours> {
    return this.prisma.locationHours.upsert({
      where: { locationId_dayOfWeek: { locationId, dayOfWeek } },
      update: { opensAt, closesAt },
      create: { locationId, dayOfWeek, opensAt, closesAt },
    });
  }

  async listHours(locationId: string): Promise<LocationHours[]> {
    return this.prisma.locationHours.findMany({
      where: { locationId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async deleteHours(locationId: string, dayOfWeek: number): Promise<void> {
    await this.prisma.locationHours.deleteMany({ where: { locationId, dayOfWeek } });
  }

  // ── Exception hours (02-C05) ───────────────────────────────────────────

  async upsertHourException(
    locationId: string,
    date: Date,
    opensAt: string | null,
    closesAt: string | null,
    reason?: string,
  ): Promise<LocationHourException> {
    return this.prisma.locationHourException.upsert({
      where: { locationId_date: { locationId, date } },
      update: { opensAt, closesAt, reason: reason ?? null },
      create: { locationId, date, opensAt, closesAt, reason: reason ?? null },
    });
  }

  async listHourExceptions(locationId: string): Promise<LocationHourException[]> {
    return this.prisma.locationHourException.findMany({
      where: { locationId },
      orderBy: { date: 'asc' },
    });
  }

  async deleteHourException(locationId: string, date: Date): Promise<void> {
    await this.prisma.locationHourException.deleteMany({ where: { locationId, date } });
  }

  // ── Delivery zones (02-C08) ────────────────────────────────────────────

  async createDeliveryZone(input: {
    tenantId: string;
    name: string;
    active?: boolean;
    feePolicyReference?: string;
  }): Promise<DeliveryZone> {
    return this.prisma.deliveryZone.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        active: input.active ?? true,
        feePolicyReference: input.feePolicyReference ?? null,
      },
    });
  }

  async listDeliveryZones(tenantId: string): Promise<DeliveryZone[]> {
    return this.prisma.deliveryZone.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  async setDeliveryZoneActive(id: string, active: boolean): Promise<DeliveryZone> {
    return this.prisma.deliveryZone.update({ where: { id }, data: { active } });
  }
}
