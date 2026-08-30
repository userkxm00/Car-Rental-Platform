import { Injectable } from '@nestjs/common';
import { BranchScopeStore } from '../ports/branch-scope.store';

/**
 * Branch scope store with no branches.
 *
 * Branches arrive in 02-C; until then no branch resolves to an agency, so
 * every branch-scoped decision denies (and tests inject their own store).
 */
@Injectable()
export class StaticBranchScopeStore extends BranchScopeStore {
  override findAgencyIdForBranch(_branchId: string): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
}
