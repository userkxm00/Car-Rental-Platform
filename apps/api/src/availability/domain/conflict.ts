/**
 * Conflict protection rules (04-B01).
 *
 * Which persisted commitments actively conflict for a vehicle, and how that
 * is enforced. Availability is computed from interval commitments — the
 * `vehicles.status` projection is never the source of truth here
 * (docs/06-business-rules.md: "A vehicle's displayed status is a
 * projection/summary, never the sole source of truth for conflict
 * prevention.").
 */

import type { BlockStatus } from './blocks';
import type { AvailabilityInterval } from './interval';
import { overlaps } from './interval';

/** Block statuses that remove the vehicle from availability. */
export const CONFLICTING_BLOCK_STATUSES: readonly BlockStatus[] = ['SCHEDULED', 'ACTIVE'];

/** Hold statuses that still reserve inventory. */
export const CONFLICTING_HOLD_STATUSES = ['ACTIVE'] as const;

export type ConflictingHoldStatus = (typeof CONFLICTING_HOLD_STATUSES)[number];

export function blockStatusConflicts(status: BlockStatus): boolean {
  return CONFLICTING_BLOCK_STATUSES.includes(status);
}

export function holdStatusConflicts(status: string): status is ConflictingHoldStatus {
  return (CONFLICTING_HOLD_STATUSES as readonly string[]).includes(status);
}

export interface ConflictingCommitment extends AvailabilityInterval {
  status: string;
}

/**
 * Two commitments conflict iff both are availability-affecting AND their
 * intervals overlap under the shared half-open contract.
 */
export function commitmentsConflict(
  a: ConflictingCommitment,
  b: ConflictingCommitment,
  isConflicting: (status: string) => boolean,
): boolean {
  return isConflicting(a.status) && isConflicting(b.status) && overlaps(a, b);
}

/**
 * Queries the conflict check for a candidate interval against existing
 * commitments. Implemented per commitment kind because the conflicting
 * status sets differ (blocks: SCHEDULED/ACTIVE; holds: ACTIVE).
 */
export interface ConflictQuery {
  findConflictingBlocks(vehicleId: string, interval: AvailabilityInterval): Promise<ConflictingCommitment[]>;
  findConflictingHolds(vehicleId: string, interval: AvailabilityInterval): Promise<ConflictingCommitment[]>;
}
