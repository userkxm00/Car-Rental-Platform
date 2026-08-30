import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Location,
  LocationHourException,
  LocationHours,
  LocationType,
  Prisma,
} from '@prisma/client';
import {
  BranchErrorCode,
  isValidDayOfWeek,
  isOpenBeforeClose,
  isValidTime,
  NAME_MAX,
} from '../domain/branch-rules';
import { LocationsRepository } from '../infrastructure/locations.repository';

export interface CreateLocationCommand {
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
}

const COUNTRY_CODE_SHAPE = /^[A-Z]{2,3}$/;

/**
 * Location + operating-hours use-cases (02-C02/04/05/07).
 *
 * Locations may be global (tenantId null, platform-managed) or tenant-owned;
 * every tenant-scoped operation verifies ownership server-side.
 */
@Injectable()
export class LocationsService {
  constructor(private readonly repository: LocationsRepository) {}

  async createLocation(command: CreateLocationCommand): Promise<Location> {
    const failures: string[] = [];
    if (
      typeof command.name !== 'string' ||
      command.name.trim().length === 0 ||
      command.name.trim().length > NAME_MAX
    ) {
      failures.push(`name: must be 1-${NAME_MAX} characters`);
    }
    if (command.countryCode !== undefined && !COUNTRY_CODE_SHAPE.test(command.countryCode)) {
      failures.push('countryCode: must be a 2-3 letter country code');
    }
    if (command.latitude !== undefined && (command.latitude < -90 || command.latitude > 90)) {
      failures.push('latitude: must be between -90 and 90');
    }
    if (command.longitude !== undefined && (command.longitude < -180 || command.longitude > 180)) {
      failures.push('longitude: must be between -180 and 180');
    }
    if (failures.length > 0) {
      throw new ConflictException({
        code: BranchErrorCode.BRANCH_VALIDATION_FAILED,
        message: 'Location input contains invalid fields.',
        details: { failures },
      });
    }
    return this.repository.createLocation({
      tenantId: command.tenantId,
      type: command.type,
      name: command.name.trim(),
      addressLine1: command.addressLine1,
      addressLine2: command.addressLine2,
      city: command.city,
      region: command.region,
      postalCode: command.postalCode,
      countryCode: command.countryCode ?? 'DZ',
      latitude: command.latitude,
      longitude: command.longitude,
      providerName: command.providerName,
      providerPlaceId: command.providerPlaceId,
      metadata: command.metadata,
    });
  }

  /** Tenant-scoped lookup: tenant-owned or global locations only. */
  async getLocation(tenantId: string, locationId: string): Promise<Location> {
    const location = await this.repository.findLocationByIdAndTenant(locationId, tenantId);
    if (!location) {
      throw new NotFoundException({
        code: BranchErrorCode.LOCATION_NOT_FOUND,
        message: 'Location not found.',
      });
    }
    return location;
  }

  async listLocations(tenantId: string): Promise<Location[]> {
    return this.repository.listLocationsForTenant(tenantId);
  }

  /** Set recurring hours for a tenant-owned location (02-C04). */
  async setHours(
    tenantId: string,
    locationId: string,
    dayOfWeek: number,
    opensAt: string,
    closesAt: string,
  ): Promise<LocationHours> {
    await this.requireOwnedLocation(tenantId, locationId);
    const failures: string[] = [];
    if (!isValidDayOfWeek(dayOfWeek)) {
      failures.push('dayOfWeek: must be an integer 0-6 (0=Monday)');
    }
    if (!isValidTime(opensAt)) {
      failures.push('opensAt: must be HH:MM (24h)');
    }
    if (!isValidTime(closesAt)) {
      failures.push('closesAt: must be HH:MM (24h)');
    }
    if (isValidTime(opensAt) && isValidTime(closesAt) && !isOpenBeforeClose(opensAt, closesAt)) {
      failures.push('hours: opensAt must be before closesAt');
    }
    if (failures.length > 0) {
      throw new ConflictException({
        code: BranchErrorCode.HOURS_VALIDATION_FAILED,
        message: 'Operating hours contain invalid fields.',
        details: { failures },
      });
    }
    return this.repository.upsertHours(locationId, dayOfWeek, opensAt, closesAt);
  }

  async listHours(tenantId: string, locationId: string): Promise<LocationHours[]> {
    await this.requireOwnedLocation(tenantId, locationId);
    return this.repository.listHours(locationId);
  }

  async deleteHours(tenantId: string, locationId: string, dayOfWeek: number): Promise<void> {
    await this.requireOwnedLocation(tenantId, locationId);
    await this.repository.deleteHours(locationId, dayOfWeek);
  }

  /** Set an exception overriding a specific date (02-C05). */
  async setException(
    tenantId: string,
    locationId: string,
    date: Date,
    opensAt: string | null,
    closesAt: string | null,
    reason?: string,
  ): Promise<LocationHourException> {
    await this.requireOwnedLocation(tenantId, locationId);
    const failures: string[] = [];
    const closedAllDay = opensAt === null && closesAt === null;
    if (!closedAllDay) {
      if (opensAt === null || !isValidTime(opensAt)) {
        failures.push('opensAt: must be HH:MM (24h) or null when closed all day');
      }
      if (closesAt === null || !isValidTime(closesAt)) {
        failures.push('closesAt: must be HH:MM (24h) or null when closed all day');
      }
      if (
        opensAt !== null &&
        closesAt !== null &&
        isValidTime(opensAt) &&
        isValidTime(closesAt) &&
        !isOpenBeforeClose(opensAt, closesAt)
      ) {
        failures.push('exception: opensAt must be before closesAt');
      }
    }
    if (failures.length > 0) {
      throw new ConflictException({
        code: BranchErrorCode.HOURS_VALIDATION_FAILED,
        message: 'Exception hours contain invalid fields.',
        details: { failures },
      });
    }
    return this.repository.upsertHourException(locationId, date, opensAt, closesAt, reason);
  }

  async listExceptions(tenantId: string, locationId: string): Promise<LocationHourException[]> {
    await this.requireOwnedLocation(tenantId, locationId);
    return this.repository.listHourExceptions(locationId);
  }

  async deleteException(tenantId: string, locationId: string, date: Date): Promise<void> {
    await this.requireOwnedLocation(tenantId, locationId);
    await this.repository.deleteHourException(locationId, date);
  }

  private async requireOwnedLocation(tenantId: string, locationId: string): Promise<Location> {
    const location = await this.repository.findLocation(locationId);
    if (!location || location.tenantId !== tenantId) {
      throw new NotFoundException({
        code: BranchErrorCode.LOCATION_NOT_FOUND,
        message: 'Location not found.',
      });
    }
    return location;
  }
}
