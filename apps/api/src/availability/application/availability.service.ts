import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityErrorCode } from '../domain/interval';
import { parseUtcInstant } from '../domain/timezone-boundary';
import type {
  AvailabilityContext,
  AvailabilityReason,
  CategoryCapacityResult,
  VehicleAvailabilityListResult,
  VehicleAvailabilityResult,
} from '../domain/availability-query';
import { AvailabilityReasonCode } from '../domain/availability-query';
import { AvailabilityRepository } from '../infrastructure/availability.repository';

/**
 * Availability queries (04-C01…C06).
 *
 * Availability is COMPUTED for a half-open interval from conflicting
 * blocks/holds, fleet lifecycle and branch context — never from a stored
 * boolean (docs/06-business-rules.md; architecture/availability-engine.md).
 *
 * Reads never guarantee a future reservation: confirmation re-checks through
 * the commitment guard (04-B).
 */
@Injectable()
export class AvailabilityService {
  constructor(private readonly repository: AvailabilityRepository) {}

  /** 04-C01/03/04/05/06: single-vehicle availability with structured reasons. */
  async vehicleAvailability(
    tenantId: string,
    vehicleId: string,
    interval: { start: Date; end: Date },
    context: AvailabilityContext,
  ): Promise<VehicleAvailabilityResult> {
    const vehicle = await this.repository.findVehicleInTenant(tenantId, vehicleId);
    if (!vehicle) {
      throw new NotFoundException({
        code: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found in this agency.',
      });
    }

    const reasons: AvailabilityReason[] = [];
    const constraintsApplied: string[] = ['fleetLifecycle', 'blocks', 'holds'];

    if (vehicle.status === 'ARCHIVED') {
      reasons.push({ code: AvailabilityReasonCode.VEHICLE_ARCHIVED });
    }

    const [blocks, holds] = await Promise.all([
      this.repository.findConflictingBlocks(vehicleId, interval),
      this.repository.findConflictingHolds(vehicleId, interval, new Date()),
    ]);

    for (const block of blocks) {
      // 04-C04 maintenance / 04-C05 inspection & readiness blockers share the
      // block model; the type travels with the reason for caller explanation.
      reasons.push({
        code: AvailabilityReasonCode.BLOCK_CONFLICT,
        blockType: block.blockType,
        commitmentId: block.id,
      });
    }
    for (const hold of holds) {
      reasons.push({ code: AvailabilityReasonCode.HOLD_CONFLICT, commitmentId: hold.id });
    }

    // 04-C03: pickup-branch constraint.
    if (context.pickupBranchId) {
      constraintsApplied.push('pickupBranch');
      if (vehicle.currentBranchId && vehicle.currentBranchId !== context.pickupBranchId) {
        reasons.push({ code: AvailabilityReasonCode.VEHICLE_AT_OTHER_BRANCH });
      }
    }

    // 04-C06: return branch and delivery zone are validated at the boundary
    // (controller) and carried for later phases.
    const constraintsPending: string[] = [];
    if (context.returnBranchId) {
      constraintsPending.push('returnBranch');
    }
    if (context.deliveryZoneId) {
      constraintsPending.push('deliveryZone');
    }

    return {
      vehicleId,
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      available: reasons.length === 0,
      reasons,
      constraintsApplied,
      constraintsPending,
    };
  }

  /** 04-C01/03: all vehicles bookable for the interval under the context. */
  async listAvailableVehicles(
    tenantId: string,
    interval: { start: Date; end: Date },
    context: AvailabilityContext,
    filters: { categoryId?: string; branchId?: string },
  ): Promise<VehicleAvailabilityListResult> {
    const vehicles = await this.repository.listAvailable(tenantId, interval, context, filters, new Date());
    return {
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      vehicles,
      total: vehicles.length,
    };
  }

  /** 04-C02: category capacity (eligible − committed = available). */
  async categoryCapacity(
    tenantId: string,
    categoryId: string,
    interval: { start: Date; end: Date },
    context: AvailabilityContext,
  ): Promise<CategoryCapacityResult> {
    const category = await this.repository.findCategoryInTenant(tenantId, categoryId);
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found in this agency.',
      });
    }
    const [eligible, committed] = await Promise.all([
      this.repository.countEligible(tenantId, categoryId, context),
      this.repository.countCommitted(tenantId, categoryId, interval, context, new Date()),
    ]);
    return {
      categoryId,
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      eligible,
      committed,
      available: Math.max(0, eligible - committed),
    };
  }

  /**
   * Validates an availability request interval at the boundary. Returns the
   * UTC instants or throws a structured INVALID_INTERVAL conflict.
   */
  validateRequestInterval(startRaw: string | undefined, endRaw: string | undefined): { start: Date; end: Date } {
    if (typeof startRaw !== 'string' || typeof endRaw !== 'string') {
      throw new ConflictException({
        code: AvailabilityErrorCode.INVALID_INTERVAL,
        message: 'start and end query parameters are required ISO-8601 instants with an offset (or Z).',
      });
    }
    const start = this.toUtcInstant(startRaw);
    const end = this.toUtcInstant(endRaw);
    if (!start || !end || end.getTime() <= start.getTime()) {
      throw new ConflictException({
        code: AvailabilityErrorCode.INVALID_INTERVAL,
        message: 'end must be strictly after start (half-open interval, UTC instants).',
      });
    }
    return { start, end };
  }

  private toUtcInstant(value: string): Date | null {
    // Must carry an explicit offset or Z — zone-less naive datetimes are
    // ambiguous and rejected at the boundary (04-A05).
    return parseUtcInstant(value);
  }
}
