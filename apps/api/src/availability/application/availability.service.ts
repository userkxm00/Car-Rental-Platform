import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityErrorCode, overlaps } from '../domain/interval';
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

  /** Tenant-scoped vehicle existence + lifecycle (quote/booking targets). */
  async findVehicleInTenant(
    tenantId: string,
    vehicleId: string,
  ): Promise<{ id: string; status: string; currentBranchId: string | null } | null> {
    return this.repository.findVehicleInTenant(tenantId, vehicleId);
  }

  /**
   * Tenant-scoped category existence + activity flag. Used by quote
   * eligibility (05-A02) — an inactive category is not quotable.
   */
  async findCategoryInTenant(
    tenantId: string,
    categoryId: string,
  ): Promise<{ id: string; active: boolean } | null> {
    return this.repository.findCategoryInTenant(tenantId, categoryId);
  }

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
   * 04-D01…D05: scheduler timeline — vehicles (filtered by vehicle/branch)
   * with every commitment intersecting the window, plus a conflict flag
   * computed from the shared half-open overlap contract (04-D03). Live
   * commitments are blocks in SCHEDULED/ACTIVE and holds ACTIVE with an
   * unexpired hold; past/terminal rows remain visible for the timeline.
   */
  async scheduleTimeline(
    tenantId: string,
    interval: { start: Date; end: Date },
    filters: { vehicleId?: string; branchId?: string },
  ): Promise<{
    start: string;
    end: string;
    vehicles: Array<{
      vehicleId: string;
      make: string;
      model: string;
      plateNumber: string;
      currentBranchId: string | null;
      commitments: Array<{
        id: string;
        kind: 'BLOCK' | 'HOLD';
        blockType: string | null;
        status: string;
        start: string;
        end: string;
        reason: string | null;
        conflicting: boolean;
      }>;
    }>;
  }> {
    const now = new Date();
    const rows = await this.repository.scheduleCommitments(tenantId, interval, filters);

    return {
      start: interval.start.toISOString(),
      end: interval.end.toISOString(),
      vehicles: rows.map((vehicle) => {
        const live = vehicle.commitments.map((c) => ({
          c,
          live:
            (c.kind === 'BLOCK' && (c.status === 'SCHEDULED' || c.status === 'ACTIVE')) ||
            (c.kind === 'HOLD' && c.status === 'ACTIVE' && c.end.getTime() > now.getTime()),
        }));
        return {
          vehicleId: vehicle.vehicleId,
          make: vehicle.make,
          model: vehicle.model,
          plateNumber: vehicle.plateNumber,
          currentBranchId: vehicle.currentBranchId,
          commitments: vehicle.commitments.map((c) => {
            const conflicting =
              c.kind === 'BLOCK'
                ? live.some(
                    (o) =>
                      o.live &&
                      o.c.kind === 'HOLD' &&
                      overlaps(
                        { start: c.start, end: c.end },
                        { start: o.c.start, end: o.c.end },
                      ),
                  )
                : live.some(
                    (o) =>
                      o.live &&
                      o.c.kind === 'BLOCK' &&
                      overlaps(
                        { start: c.start, end: c.end },
                        { start: o.c.start, end: o.c.end },
                      ),
                  );
            return {
              id: c.id,
              kind: c.kind,
              blockType: c.blockType,
              status: c.status,
              start: c.start.toISOString(),
              end: c.end.toISOString(),
              reason: c.reason,
              conflicting,
            };
          }),
        };
      }),
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
