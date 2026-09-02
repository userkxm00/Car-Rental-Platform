/**
 * Availability query contracts and reason codes (04-C08).
 *
 * Availability is a computed answer, not a stored boolean. Every
 * "not available" answer carries a structured reason so callers can explain
 * constraints to users (architecture/availability-engine.md "Search
 * behavior": results must explain relevant constraints).
 *
 * IMPORTANT (architecture/availability-engine.md "Atomicity"): a successful
 * availability read never guarantees a future reservation — confirmation
 * goes through the commitment guard (04-B) which re-checks under a lock.
 */

/** Why a vehicle is not available for a given interval. */
export const AvailabilityReasonCode = {
  VEHICLE_ARCHIVED: 'VEHICLE_ARCHIVED',
  BLOCK_CONFLICT: 'BLOCK_CONFLICT',
  HOLD_CONFLICT: 'HOLD_CONFLICT',
  VEHICLE_AT_OTHER_BRANCH: 'VEHICLE_AT_OTHER_BRANCH',
} as const;

export type AvailabilityReasonCodeValue =
  (typeof AvailabilityReasonCode)[keyof typeof AvailabilityReasonCode];

export interface AvailabilityReason {
  code: AvailabilityReasonCodeValue;
  /** Block type when code is BLOCK_CONFLICT (MAINTENANCE, INSPECTION, …). */
  blockType?: string;
  commitmentId?: string;
}

export interface AvailabilityContext {
  /**
   * The branch the inventory must be pick-up-able from. A vehicle assigned
   * to another branch is not bookable for this context; unassigned (pool)
   * vehicles are eligible anywhere.
   */
  pickupBranchId?: string;
  /**
   * Requested return branch — carried for the booking phase; one-way return
   * policies/repositioning are not yet modeled (documented constraint
   * boundary, see the controller docs).
   */
  returnBranchId?: string;
  /**
   * Requested delivery zone — validated (tenant-owned, active) and carried
   * for the spatial/pricing phases; zone-based vehicle eligibility is a
   * spatial-phase concern and is reported as a pending constraint.
   */
  deliveryZoneId?: string;
}

export interface VehicleAvailabilityResult {
  vehicleId: string;
  /** 05-A04: lets quote pricing match category-scoped rate plans when the
   * request names only the vehicle. */
  categoryId: string;
  start: string;
  end: string;
  available: boolean;
  reasons: AvailabilityReason[];
  /** Constraints actually evaluated for this answer. */
  constraintsApplied: string[];
  /** Requested constraints that later phases will evaluate. */
  constraintsPending: string[];
}

export interface AvailableVehicleSummary {
  id: string;
  categoryId: string;
  currentBranchId: string | null;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
}

export interface VehicleAvailabilityListResult {
  start: string;
  end: string;
  vehicles: AvailableVehicleSummary[];
  total: number;
}

export interface CategoryCapacityResult {
  categoryId: string;
  start: string;
  end: string;
  /** Vehicles of this category eligible for the context (active, not archived, branch-constrained). */
  eligible: number;
  /** Distinct eligible vehicles with a conflicting block or hold for the interval. */
  committed: number;
  /** eligible - committed. */
  available: number;
}
