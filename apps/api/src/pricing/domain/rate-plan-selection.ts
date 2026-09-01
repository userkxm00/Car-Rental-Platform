/**
 * PHASE-06 / 06-A06: deterministic rate-plan precedence.
 *
 * The engine (06-B) asks for the applicable plan of a target; ambiguity is
 * impossible because candidates are totally ordered:
 *
 *   1. scope specificity — VEHICLE (3) > CATEGORY (2) > GLOBAL (1)
 *   2. `precedence` descending (higher wins; admin-controlled)
 *   3. `effectiveFrom` descending (the most recent window wins)
 *   4. `createdAt` ascending, then `id` ascending (stable tiebreak)
 *
 * Overlapping windows are therefore never ambiguous: the ordering is fixed
 * and documented (architecture/pricing-engine.md "deterministic precedence
 * order"). The effective-window predicate is exclusive of `effectiveUntil`
 * (half-open `[from, until)`), matching the 04-A interval conventions.
 */

export type RatePlanScopeKind = 'VEHICLE' | 'CATEGORY' | 'GLOBAL';

export interface RatePlanCandidate {
  id: string;
  currency: string;
  durationUnit: string;
  baseRateMinor: number;
  precedence: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  active: boolean;
  createdAt: Date;
  scopeKind: RatePlanScopeKind;
  vehicleId?: string;
  categoryId?: string;
}

const SPECIFICITY: Record<RatePlanScopeKind, number> = {
  VEHICLE: 3,
  CATEGORY: 2,
  GLOBAL: 1,
};

export function ratePlanSpecificity(scopeKind: RatePlanScopeKind): number {
  return SPECIFICITY[scopeKind];
}

/** Half-open effective window check at `now` (06-A03). */
export function isRatePlanEffective(plan: RatePlanCandidate, now: Date): boolean {
  if (!plan.active) {
    return false;
  }
  if (plan.effectiveFrom.getTime() > now.getTime()) {
    return false;
  }
  return plan.effectiveUntil === null || plan.effectiveUntil.getTime() > now.getTime();
}

/**
 * Total order over candidates for the SAME tenant and target — returns
 * negative when `a` ranks before (wins over) `b`.
 */
export function compareRatePlanCandidates(a: RatePlanCandidate, b: RatePlanCandidate): number {
  const specificity = ratePlanSpecificity(b.scopeKind) - ratePlanSpecificity(a.scopeKind);
  if (specificity !== 0) {
    return specificity;
  }
  if (b.precedence !== a.precedence) {
    return b.precedence - a.precedence;
  }
  if (b.effectiveFrom.getTime() !== a.effectiveFrom.getTime()) {
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  }
  if (a.createdAt.getTime() !== b.createdAt.getTime()) {
    return a.createdAt.getTime() - b.createdAt.getTime();
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Selects the single applicable plan for `now`, or null when none is
 * effective. Used by the 06-B calculation; enforced here (06-A06) so the
 * ordering is one pure, unit-tested function.
 */
export function selectEffectiveRatePlan(
  candidates: RatePlanCandidate[],
  now: Date,
): RatePlanCandidate | null {
  const effective = candidates.filter((candidate) => isRatePlanEffective(candidate, now));
  if (effective.length === 0) {
    return null;
  }
  return [...effective].sort(compareRatePlanCandidates)[0] ?? null;
}
