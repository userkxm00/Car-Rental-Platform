import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AvailabilityInterval } from '../domain/interval';
import type { AvailabilityContext } from '../domain/availability-query';

/**
 * Availability read queries (04-C01…C05).
 *
 * All queries are tenant-scoped by an explicit tenantId and evaluate the
 * shared half-open interval contract directly in SQL using the generated
 * `period` tstzrange columns (04-B02). Reads use a plain snapshot — a
 * successful read never guarantees a later confirmation (04-B re-checks
 * under a lock).
 */

export interface BlockConflictRow {
  id: string;
  blockType: string;
}

export interface HoldConflictRow {
  id: string;
}

@Injectable()
export class AvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant-scoped vehicle lookup for the single-vehicle availability answer. */
  async findVehicleInTenant(
    tenantId: string,
    vehicleId: string,
  ): Promise<{ id: string; status: string; currentBranchId: string | null } | null> {
    return this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
      select: { id: true, status: true, currentBranchId: true },
    });
  }

  /** Tenant-scoped category lookup for the capacity answer. */
  async findCategoryInTenant(
    tenantId: string,
    categoryId: string,
  ): Promise<{ id: string; active: boolean } | null> {
    return this.prisma.vehicleCategory.findFirst({
      where: { id: categoryId, tenantId },
      select: { id: true, active: true },
    });
  }

  /** Conflicting SCHEDULED/ACTIVE blocks for one vehicle + interval. */
  async findConflictingBlocks(
    vehicleId: string,
    interval: AvailabilityInterval,
  ): Promise<BlockConflictRow[]> {
    return this.prisma.$queryRaw<BlockConflictRow[]>`
      SELECT "id", "blockType"::text AS "blockType"
      FROM "vehicle_blocks"
      WHERE "vehicleId" = ${vehicleId}::uuid
        AND "status" IN ('SCHEDULED', 'ACTIVE')
        AND "period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')`;
  }

  /**
   * Conflicting ACTIVE holds for one vehicle + interval. Holds past their
   * expiry are inert for reads as well as writes (04-B05 semantics).
   */
  async findConflictingHolds(
    vehicleId: string,
    interval: AvailabilityInterval,
    now: Date,
  ): Promise<HoldConflictRow[]> {
    return this.prisma.$queryRaw<HoldConflictRow[]>`
      SELECT "id"
      FROM "booking_holds"
      WHERE "vehicleId" = ${vehicleId}::uuid
        AND "status" = 'ACTIVE'
        AND "expiresAt" > ${now}
        AND "period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')`;
  }

  /**
   * All vehicles of a tenant that are bookable for the interval under the
   * given context: not archived, no conflicting blocks, no live conflicting
   * holds, and (when a pickup branch is requested) unassigned or assigned to
   * that branch.
   */
  async listAvailable(
    tenantId: string,
    interval: AvailabilityInterval,
    context: AvailabilityContext,
    filters: { categoryId?: string; branchId?: string },
    now: Date,
  ): Promise<
    Array<{
      id: string;
      categoryId: string;
      currentBranchId: string | null;
      make: string;
      model: string;
      year: number;
      plateNumber: string;
    }>
  > {
    return this.prisma.$queryRaw`
      SELECT v."id", v."categoryId", v."currentBranchId", v."make", v."model", v."year", v."plateNumber"
      FROM "vehicles" v
      WHERE v."tenantId" = ${tenantId}::uuid
        AND v."status" <> 'ARCHIVED'
        AND (${filters.categoryId ?? null}::uuid IS NULL OR v."categoryId" = ${filters.categoryId ?? null}::uuid)
        AND (${filters.branchId ?? context.pickupBranchId ?? null}::uuid IS NULL
             OR v."currentBranchId" = ${filters.branchId ?? context.pickupBranchId ?? null}::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM "vehicle_blocks" b
          WHERE b."vehicleId" = v."id"
            AND b."status" IN ('SCHEDULED', 'ACTIVE')
            AND b."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM "booking_holds" h
          WHERE h."vehicleId" = v."id"
            AND h."status" = 'ACTIVE'
            AND h."expiresAt" > ${now}
            AND h."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
        )
      ORDER BY v."make", v."model"`;
  }

  /** Count of eligible vehicles for a category + context (04-C02). */
  async countEligible(
    tenantId: string,
    categoryId: string,
    context: AvailabilityContext,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM "vehicles" v
      WHERE v."tenantId" = ${tenantId}::uuid
        AND v."categoryId" = ${categoryId}::uuid
        AND v."status" <> 'ARCHIVED'
        AND (${context.pickupBranchId ?? null}::uuid IS NULL OR v."currentBranchId" = ${context.pickupBranchId ?? null}::uuid)`;
    return Number(rows[0]?.count ?? 0);
  }

  /** Distinct eligible vehicles of the category with a conflicting commitment (04-C02). */
  async countCommitted(
    tenantId: string,
    categoryId: string,
    interval: AvailabilityInterval,
    context: AvailabilityContext,
    now: Date,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(DISTINCT v."id")::bigint AS count
      FROM "vehicles" v
      WHERE v."tenantId" = ${tenantId}::uuid
        AND v."categoryId" = ${categoryId}::uuid
        AND v."status" <> 'ARCHIVED'
        AND (${context.pickupBranchId ?? null}::uuid IS NULL OR v."currentBranchId" = ${context.pickupBranchId ?? null}::uuid)
        AND (
          EXISTS (
            SELECT 1 FROM "vehicle_blocks" b
            WHERE b."vehicleId" = v."id"
              AND b."status" IN ('SCHEDULED', 'ACTIVE')
              AND b."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
          )
          OR EXISTS (
            SELECT 1 FROM "booking_holds" h
            WHERE h."vehicleId" = v."id"
              AND h."status" = 'ACTIVE'
              AND h."expiresAt" > ${now}
              AND h."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
          )
        )`;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * 04-D01: vehicles of the tenant (optionally one vehicle / one branch)
   * with their commitments intersecting the schedule window. Blocks and
   * holds are returned side by side; overlap conflicts are computed by the
   * service from the shared half-open contract.
   */
  async scheduleCommitments(
    tenantId: string,
    interval: AvailabilityInterval,
    filters: { vehicleId?: string; branchId?: string },
  ): Promise<
    Array<{
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
        start: Date;
        end: Date;
        reason: string | null;
      }>;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        vehicleId: string;
        make: string;
        model: string;
        plateNumber: string;
        currentBranchId: string | null;
        kind: 'BLOCK' | 'HOLD' | null;
        id: string | null;
        blockType: string | null;
        status: string | null;
        start: Date | null;
        end: Date | null;
        reason: string | null;
      }>
    >`
      SELECT
        v."id" AS "vehicleId",
        v."make" AS "make",
        v."model" AS "model",
        v."plateNumber" AS "plateNumber",
        v."currentBranchId" AS "currentBranchId",
        'BLOCK' AS "kind",
        b."id" AS "id",
        b."blockType"::text AS "blockType",
        b."status"::text AS "status",
        b."startsAt" AS "start",
        b."endsAt" AS "end",
        b."reason" AS "reason"
      FROM "vehicles" v
      JOIN "vehicle_blocks" b ON b."vehicleId" = v."id"
      WHERE v."tenantId" = ${tenantId}::uuid
        AND (${filters.vehicleId ?? null}::uuid IS NULL OR v."id" = ${filters.vehicleId ?? null}::uuid)
        AND (${filters.branchId ?? null}::uuid IS NULL OR v."currentBranchId" = ${filters.branchId ?? null}::uuid)
        AND b."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
      UNION ALL
      SELECT
        v."id" AS "vehicleId",
        v."make" AS "make",
        v."model" AS "model",
        v."plateNumber" AS "plateNumber",
        v."currentBranchId" AS "currentBranchId",
        'HOLD' AS "kind",
        h."id" AS "id",
        NULL AS "blockType",
        h."status"::text AS "status",
        h."startsAt" AS "start",
        h."endsAt" AS "end",
        NULL AS "reason"
      FROM "vehicles" v
      JOIN "booking_holds" h ON h."vehicleId" = v."id"
      WHERE v."tenantId" = ${tenantId}::uuid
        AND (${filters.vehicleId ?? null}::uuid IS NULL OR v."id" = ${filters.vehicleId ?? null}::uuid)
        AND (${filters.branchId ?? null}::uuid IS NULL OR v."currentBranchId" = ${filters.branchId ?? null}::uuid)
        AND h."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
      UNION ALL
      SELECT
        v."id" AS "vehicleId",
        v."make" AS "make",
        v."model" AS "model",
        v."plateNumber" AS "plateNumber",
        v."currentBranchId" AS "currentBranchId",
        NULL AS "kind",
        NULL AS "id",
        NULL AS "blockType",
        NULL AS "status",
        NULL AS "start",
        NULL AS "end",
        NULL AS "reason"
      FROM "vehicles" v
      WHERE v."tenantId" = ${tenantId}::uuid
        AND v."status" <> 'ARCHIVED'
        AND (${filters.vehicleId ?? null}::uuid IS NULL OR v."id" = ${filters.vehicleId ?? null}::uuid)
        AND (${filters.branchId ?? null}::uuid IS NULL OR v."currentBranchId" = ${filters.branchId ?? null}::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM "vehicle_blocks" b
          WHERE b."vehicleId" = v."id"
            AND b."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
        )
        AND NOT EXISTS (
          SELECT 1 FROM "booking_holds" h
          WHERE h."vehicleId" = v."id"
            AND h."period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')
        )
      ORDER BY "make", "model", "start"`;

    const byVehicle = new Map<
      string,
      {
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
          start: Date;
          end: Date;
          reason: string | null;
        }>;
      }
    >();
    for (const row of rows) {
      let entry = byVehicle.get(row.vehicleId);
      if (!entry) {
        entry = {
          vehicleId: row.vehicleId,
          make: row.make,
          model: row.model,
          plateNumber: row.plateNumber,
          currentBranchId: row.currentBranchId,
          commitments: [],
        };
        byVehicle.set(row.vehicleId, entry);
      }
      // Placeholder rows (third UNION branch) mark vehicles that have no
      // commitments in the window: keep the lane, skip the pseudo-row.
      if (row.id && row.kind && row.status && row.start && row.end) {
        entry.commitments.push({
          id: row.id,
          kind: row.kind,
          blockType: row.blockType,
          status: row.status,
          start: row.start,
          end: row.end,
          reason: row.reason,
        });
      }
    }
    return [...byVehicle.values()];
  }
}
