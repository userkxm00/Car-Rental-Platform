/**
 * Branch scope store port (01-D07).
 *
 * Resolves which agency a branch belongs to, so branch-scoped guards can
 * verify the caller's agency membership before granting branch access. The
 * database-backed implementation lands with 02-C (branches).
 */
export abstract class BranchScopeStore {
  /** The agency that owns a branch (undefined if unknown). */
  abstract findAgencyIdForBranch(branchId: string): Promise<string | undefined>;
}
