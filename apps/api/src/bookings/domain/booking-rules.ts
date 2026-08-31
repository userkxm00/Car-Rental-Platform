import type { BookingStatus } from '@prisma/client';

/**
 * Booking domain rules (05-B).
 *
 * Statuses follow the operative implementation plan
 * (agent/IMPLEMENTATION-WBS-V2.md 05-C); the product state machine
 * (docs/10-booking-state-machine.md) maps onto them: QUOTED is represented
 * by the linked quote record (05-A), PREPARING/CHECKED_OUT merge into
 * READY_FOR_PICKUP, IN_RENTAL is ACTIVE, RETURNING is RETURN_PENDING and
 * INSPECTION_PENDING is RETURNED; extension/overdue are modeled as records
 * (05-D), not statuses. Status transitions are explicit domain commands
 * (05-C) — clients can never set a status directly.
 */

export const BookingErrorCode = {
  /** Interval boundary errors (shared with 04-A). */
  INVALID_INTERVAL: 'INVALID_INTERVAL',
  /** Pickup instant must lie in the future (05-A02 eligibility). */
  INTERVAL_IN_PAST: 'INTERVAL_IN_PAST',
  /** Neither vehicleId nor categoryId was provided. */
  BOOKING_TARGET_REQUIRED: 'BOOKING_TARGET_REQUIRED',
  /** Both vehicleId and categoryId were provided — exactly one is allowed. */
  BOOKING_TARGET_EXCLUSIVE: 'BOOKING_TARGET_EXCLUSIVE',
  INVALID_CHANNEL: 'INVALID_CHANNEL',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  /** Category exists in the tenant but is not active. */
  CATEGORY_INACTIVE: 'CATEGORY_INACTIVE',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  DELIVERY_ZONE_NOT_FOUND: 'DELIVERY_ZONE_NOT_FOUND',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  /** The server-computed availability answer rejected the request. */
  BOOKING_UNAVAILABLE: 'BOOKING_UNAVAILABLE',
  /** The requested transition is not allowed from the current state. */
  BOOKING_INVALID_TRANSITION: 'BOOKING_INVALID_TRANSITION',
  /** The commitment guard rejected the interval (04-B write path). */
  INTERVAL_CONFLICT: 'INTERVAL_CONFLICT',
  /** Category bookings hold capacity, not a vehicle interval. */
  BOOKING_HOLD_UNSUPPORTED: 'BOOKING_HOLD_UNSUPPORTED',
} as const;

export type BookingErrorCodeValue = (typeof BookingErrorCode)[keyof typeof BookingErrorCode];

export const BOOKING_CHANNELS = [
  'MARKETPLACE',
  'AGENCY_WEB',
  'STAFF',
  'PHONE',
  'WALK_IN',
  'IMPORT',
] as const;
export type BookingChannel = (typeof BOOKING_CHANNELS)[number];

/** Statuses a booking can hold, in the operative 05-C list order. */
export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'DRAFT',
  'HOLD',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'READY_FOR_PICKUP',
  'ACTIVE',
  'RETURN_PENDING',
  'RETURNED',
  'SETTLEMENT_PENDING',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'EXPIRED',
  'REJECTED',
];

/**
 * 05-B02: human-readable, tenant-unique booking number from the per-tenant
 * counter: `BK-{year}-{six-digit sequence}`.
 */
export function formatBookingNumber(sequence: number, at: Date = new Date()): string {
  const year = at.getUTCFullYear();
  return `BK-${year}-${String(sequence).padStart(6, '0')}`;
}

/** Raw client input for booking creation — validated at the boundary. */
export interface BookingRequestInput {
  channel?: string;
  vehicleId?: string;
  categoryId?: string;
  start?: string;
  end?: string;
  pickupBranchId?: string;
  returnBranchId?: string;
  deliveryZoneId?: string;
}

export interface ValidatedBookingRequest {
  channel: BookingChannel;
  mode: 'VEHICLE' | 'CATEGORY';
  vehicleId: string | null;
  categoryId: string | null;
  start: Date;
  end: Date;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
}
