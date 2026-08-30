import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tenant isolation helpers (02-D01/02-D02).
 *
 * The server attaches the verified tenant scope (AgencyScopeGuard, 01-D06);
 * these helpers make that scope enforceable at the data layer so a missing
 * or mismatched scope can never read or write another tenant's rows.
 */

/** Models that carry a direct tenantId column. */
const TENANT_OWNED_MODELS: ReadonlySet<string> = new Set<string>([
  'Membership',
  'Branch',
  'Location',
  'DeliveryZone',
]);

const TENANT_ID_FIELD = 'tenantId';

export interface TenantScopeContext {
  tenantId: string;
}

/**
 * Returns a Prisma client whose operations on tenant-owned models are
 * forced to the given tenant scope:
 * - reads/updates/deletes add `tenantId = <scope>` to the where clause;
 * - creates inject `tenantId = <scope>` (client input is overridden);
 * - cross-scope where/create values throw instead of silently widening
 *   access.
 *
 * Used by jobs/exports and any non-HTTP execution path (02-D03/02-D04).
 */
export function tenantScopedClient(
  prisma: PrismaService,
  scope: TenantScopeContext,
): PrismaService {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (TENANT_OWNED_MODELS.has(model ?? '')) {
            if (operation === 'create') {
              const data = (args as { data?: Record<string, unknown> }).data ?? {};
              assertScope(data, scope);
              (args as { data: Record<string, unknown> }).data = {
                ...data,
                [TENANT_ID_FIELD]: scope.tenantId,
              };
            } else {
              const where = (args as { where?: Record<string, unknown> }).where ?? {};
              assertScope(where, scope);
              (args as { where: Record<string, unknown> }).where = {
                ...where,
                [TENANT_ID_FIELD]: scope.tenantId,
              };
            }
          }
          return query(args);
        },
      },
    },
  }) as PrismaService;
}

function assertScope(input: Record<string, unknown>, scope: TenantScopeContext): void {
  const value = input[TENANT_ID_FIELD];
  if (value !== undefined && value !== scope.tenantId) {
    throw new Prisma.PrismaClientValidationError(
      `Tenant scope violation: request tried to touch tenant ${JSON.stringify(value)} from tenant scope ${scope.tenantId}.`,
      { clientVersion: 'tenant-scope' },
    );
  }
}

/** Validates a job/export payload carries the expected tenant scope (02-D03). */
export function assertTenantScope(payload: { tenantId?: string }, scope: TenantScopeContext): void {
  if (payload.tenantId !== scope.tenantId) {
    throw new Prisma.PrismaClientValidationError(
      `Tenant scope violation in payload: expected ${scope.tenantId}, received ${payload.tenantId ?? 'none'}.`,
      { clientVersion: 'tenant-scope' },
    );
  }
}

/** Cross-tenant equality guard for direct entity checks (02-D02). */
export function assertSameTenant(entityTenantId: string, scope: TenantScopeContext): void {
  if (entityTenantId !== scope.tenantId) {
    throw new Prisma.PrismaClientValidationError(
      `Tenant scope violation: entity belongs to ${entityTenantId}, scope is ${scope.tenantId}.`,
      { clientVersion: 'tenant-scope' },
    );
  }
}
