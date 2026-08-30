import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertSameTenant, assertTenantScope, tenantScopedClient } from './tenant-scoped-prisma';

/**
 * Unit-level contract tests for the tenant-scope helpers. The database-level
 * proof lives in test/isolation.e2e-spec.ts (02-D06/07/08).
 */

type OperationArgs = { where?: Record<string, unknown>; data?: Record<string, unknown> };
type HandlerParams = {
  model: string;
  operation: string;
  args: OperationArgs;
  query: (args: OperationArgs) => unknown;
};

class FakePrisma {
  handler?: (params: HandlerParams) => unknown;

  $extends(ext: {
    query: {
      $allModels: { $allOperations: (params: HandlerParams) => unknown };
    };
  }): PrismaService {
    this.handler = ext.query.$allModels.$allOperations;
    return this as unknown as PrismaService;
  }

  /** Simulates one client call routed through the extension handler. */
  async call(model: string, operation: string, args: OperationArgs): Promise<OperationArgs> {
    if (!this.handler) {
      throw new Error('extension not installed');
    }
    const result = this.handler({
      model,
      operation,
      args,
      query: (finalArgs: OperationArgs) => Promise.resolve(finalArgs),
    });
    return (await result) as OperationArgs;
  }
}

function scopedFake(tenantId: string): { fake: FakePrisma; client: PrismaService } {
  const fake = new FakePrisma();
  const client = tenantScopedClient(fake as unknown as PrismaService, { tenantId });
  return { fake, client };
}

describe('tenantScopedClient (02-D02)', () => {
  const T = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const OTHER = '11111111-2222-4333-8444-555555555555';

  it('injects the tenant scope into creates of tenant-owned models', async () => {
    const { fake } = scopedFake(T);
    const final = await fake.call('Branch', 'create', { data: { name: 'X' } });
    expect(final.data).toEqual({ name: 'X', tenantId: T });
  });

  it('injects the tenant scope into reads of tenant-owned models', async () => {
    const { fake } = scopedFake(T);
    const final = await fake.call('DeliveryZone', 'findMany', { where: { active: true } });
    expect(final.where).toEqual({ active: true, tenantId: T });
  });

  it('rejects cross-tenant where values instead of widening access', async () => {
    const { fake } = scopedFake(T);
    await expect(
      fake.call('Branch', 'findMany', { where: { tenantId: OTHER } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError);
  });

  it('rejects cross-tenant create inputs', async () => {
    const { fake } = scopedFake(T);
    await expect(
      fake.call('Branch', 'create', { data: { name: 'X', tenantId: OTHER } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError);
  });

  it('leaves non-tenant models untouched', async () => {
    const { fake } = scopedFake(T);
    const final = await fake.call('User', 'findMany', { where: { status: 'ACTIVE' } });
    expect(final.where).toEqual({ status: 'ACTIVE' });
  });

  it('forces updates and deletes into the scope', async () => {
    const { fake } = scopedFake(T);
    const update = await fake.call('Branch', 'updateMany', {
      where: { id: 'b1' },
      data: { name: 'X' },
    });
    expect(update.where).toEqual({ id: 'b1', tenantId: T });
    const del = await fake.call('Branch', 'deleteMany', { where: { id: 'b1' } });
    expect(del.where).toEqual({ id: 'b1', tenantId: T });
  });
});

describe('scope assertion helpers', () => {
  const scope = { tenantId: 'tenant-1' };

  it('assertTenantScope accepts a matching payload scope', () => {
    expect(() => assertTenantScope({ tenantId: 'tenant-1' }, scope)).not.toThrow();
  });

  it('assertTenantScope rejects a mismatched or missing payload scope (02-D03)', () => {
    expect(() => assertTenantScope({ tenantId: 'tenant-2' }, scope)).toThrow(/scope violation/);
    expect(() => assertTenantScope({}, scope)).toThrow(/scope violation/);
  });

  it('assertSameTenant rejects cross-tenant entity references (02-D02)', () => {
    expect(() => assertSameTenant('tenant-1', scope)).not.toThrow();
    expect(() => assertSameTenant('tenant-9', scope)).toThrow(/scope violation/);
  });
});
