/**
 * Operational block interval semantics (04-A02).
 *
 * Blocks are time-bounded operational commitments that remove a vehicle from
 * availability. They share the half-open interval contract from
 * `interval.ts`; this module adds the block vocabulary and lifecycle.
 */

import type { AvailabilityInterval, IntervalFailure } from './interval';
import { validateInterval } from './interval';

/** Block types (architecture/database-schema-v1.md § vehicle_blocks). */
export const BLOCK_TYPES = [
  'MAINTENANCE',
  'INSPECTION',
  'DAMAGE',
  'TRANSFER',
  'MANUAL',
  'CLEANING',
  'OTHER',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Block lifecycle:
 * - SCHEDULED: planned, in the future; already removes availability.
 * - ACTIVE: currently ongoing; removes availability.
 * - COMPLETED: finished; no availability impact.
 * - CANCELLED: planned work that will not happen; no availability impact.
 */
export const BLOCK_STATUSES = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

export type BlockStatus = (typeof BLOCK_STATUSES)[number];

export const AVAILABILITY_BLOCKING_STATUSES: readonly BlockStatus[] = ['SCHEDULED', 'ACTIVE'];

export interface VehicleBlockInterval extends AvailabilityInterval {
  blockType: BlockType;
  status: BlockStatus;
}

export type BlockFailure =
  | IntervalFailure
  | { field: 'blockType' | 'status'; reason: string };

export function isValidBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

export function isValidBlockStatus(value: string): value is BlockStatus {
  return (BLOCK_STATUSES as readonly string[]).includes(value);
}

/** True when a block with this status removes the vehicle from availability. */
export function blockRemovesAvailability(status: BlockStatus): boolean {
  return AVAILABILITY_BLOCKING_STATUSES.includes(status);
}

export function validateVehicleBlock(
  start: Date,
  end: Date,
  blockType: string,
  status: string,
): BlockFailure[] {
  const failures: BlockFailure[] = [...validateInterval(start, end)];

  if (!isValidBlockType(blockType)) {
    failures.push({ field: 'blockType', reason: `unknown block type: ${blockType}` });
  }
  if (!isValidBlockStatus(status)) {
    failures.push({ field: 'status', reason: `unknown block status: ${status}` });
  }

  return failures;
}
