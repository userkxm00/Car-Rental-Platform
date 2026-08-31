import type { Prisma, PrismaClient } from '@prisma/client';
import type { AvailabilityInterval } from '../domain/interval';
import { AvailabilityErrorCode } from '../domain/interval';

/**
 * Commitment guard (04-B03/04-B04): the transaction + lock/retry strategy for
 * every availability-consuming write (blocks, holds, later bookings).
 *
 * Strategy (architecture/availability-engine.md "Atomicity"):
 * 1. One transaction per write.
 * 2. `SELECT … FOR UPDATE` on the vehicle row first — serializes every
 *    commitment mutation per vehicle, so check-then-insert is atomic.
 * 3. Stale holds are lazily expired inside the same transaction (04-B05).
 * 4. Explicit conflict check before insert; the PostgreSQL exclusion
 *    constraints (04-B02) remain as the database-level backstop for bugs.
 * 5. Retried once on serialization/deadlock (40001/40P01); exclusion
 *    violations (23P01) are translated to INTERVAL_CONFLICT, never retried.
 */

export const EXCLUSION_VIOLATION_CODE = '23P01';
export const SERIALIZATION_FAILURE_CODE = '40001';
export const DEADLOCK_CODE = '40P01';

export class IntervalConflictError extends Error {
  readonly code = AvailabilityErrorCode.INTERVAL_CONFLICT;

  constructor(message: string) {
    super(message);
    this.name = 'IntervalConflictError';
  }
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function isRetryableCommitmentError(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === SERIALIZATION_FAILURE_CODE || code === DEADLOCK_CODE;
}

export function isExclusionViolation(error: unknown): boolean {
  return pgErrorCode(error) === EXCLUSION_VIOLATION_CODE;
}

/**
 * Serializes all availability-consuming writes for one vehicle: an exclusive
 * row lock, so concurrent check-then-insert transactions for the same
 * vehicle queue up and re-check against committed data. (Shared locks would
 * let two writers pass each other and rely solely on the constraint.)
 */
export async function lockVehicleRow(tx: Prisma.TransactionClient, vehicleId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "vehicles" WHERE id = ${vehicleId}::uuid FOR UPDATE`;
}

/** 04-B05: lazily expire stale ACTIVE holds so they can never block new work. */
export async function expireStaleHolds(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  now: Date = new Date(),
): Promise<number> {
  return tx.$executeRaw`
    UPDATE "booking_holds"
    SET "status" = 'EXPIRED'
    WHERE "vehicleId" = ${vehicleId}::uuid
      AND "status" = 'ACTIVE'
      AND "expiresAt" <= ${now}`;
}

/** Conflicting SCHEDULED/ACTIVE blocks overlapping the candidate interval. */
export async function findConflictingBlocks(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  interval: AvailabilityInterval,
): Promise<Array<{ id: string; blockType: string; startsAt: Date; endsAt: Date }>> {
  return tx.$queryRaw`
    SELECT "id", "blockType", "startsAt", "endsAt"
    FROM "vehicle_blocks"
    WHERE "vehicleId" = ${vehicleId}::uuid
      AND "status" IN ('SCHEDULED', 'ACTIVE')
      AND "period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')`;
}

/** Conflicting ACTIVE holds overlapping the candidate interval. */
export async function findConflictingHolds(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  interval: AvailabilityInterval,
): Promise<Array<{ id: string; startsAt: Date; endsAt: Date }>> {
  return tx.$queryRaw`
    SELECT "id", "startsAt", "endsAt"
    FROM "booking_holds"
    WHERE "vehicleId" = ${vehicleId}::uuid
      AND "status" = 'ACTIVE'
      AND "period" && tstzrange(${interval.start}::timestamptz, ${interval.end}::timestamptz, '[)')`;
}

/**
 * Asserts a candidate interval is free for the vehicle inside the current
 * transaction (after stale-hold expiry) — the explicit pre-insert check.
 */
export async function assertIntervalFree(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  interval: AvailabilityInterval,
  now: Date = new Date(),
): Promise<void> {
  await expireStaleHolds(tx, vehicleId, now);
  const [blocks, holds] = await Promise.all([
    findConflictingBlocks(tx, vehicleId, interval),
    findConflictingHolds(tx, vehicleId, interval),
  ]);
  if (blocks.length > 0 || holds.length > 0) {
    throw new IntervalConflictError(
      `Interval conflicts with ${blocks.length} block(s) and ${holds.length} hold(s) for vehicle ${vehicleId}`,
    );
  }
}

/**
 * Runs an availability-consuming write with the full guard strategy:
 * per-vehicle serialization, single retry on serialization/deadlock, and
 * INTERVAL_CONFLICT translation for database-level exclusion violations.
 */
export async function withVehicleCommitmentLock<T>(
  prisma: PrismaClient,
  vehicleId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const attempt = async (): Promise<T> =>
    prisma.$transaction(async (tx) => {
      await lockVehicleRow(tx, vehicleId);
      return action(tx);
    });

  try {
    return await attempt();
  } catch (error) {
    if (isRetryableCommitmentError(error)) {
      return attempt();
    }
    if (isExclusionViolation(error)) {
      throw new IntervalConflictError('Database exclusion constraint rejected the commitment interval.');
    }
    throw error;
  }
}
