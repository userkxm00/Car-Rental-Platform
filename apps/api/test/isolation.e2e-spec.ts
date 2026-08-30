import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { tenantScopedClient } from '../src/isolation/tenant-scoped-prisma';
import { TenantService } from '../src/tenants/application/tenant.service';
import { BranchesService } from '../src/locations/application/branches.service';
import { LocationsService } from '../src/locations/application/locations.service';
import { DeliveryZonesService } from '../src/locations/application/delivery-zones.service';

/**
 * Tenant isolation integration tests (02-D06/07/08): cross-tenant read,
 * write and export denial enforced at the data layer over real PostgreSQL.
 * Suite owns the `iso-` slug namespace.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';

/** Export-style read helper: collects a tenant's branches via the scoped client. */
async function exportTenantBranches(prisma: PrismaService, tenantId: string): Promise<string[]> {
  const client = tenantScopedClient(prisma, { tenantId });
  const rows = await client.branch.findMany({ orderBy: { code: 'asc' } });
  return rows.map((row) => row.code);
}

describe('Tenant isolation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenants: TenantService;
  let branches: BranchesService;
  let locations: LocationsService;
  let zones: DeliveryZonesService;

  let tenantA: string;
  let tenantB: string;
  let branchAId: string;
  let locationAId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    prisma = app.get(PrismaService);
    tenants = app.get(TenantService);
    branches = app.get(BranchesService);
    locations = app.get(LocationsService);
    zones = app.get(DeliveryZonesService);

    tenantA = (await tenants.create({ name: 'ISO A', slug: 'iso-a' })).id;
    tenantB = (await tenants.create({ name: 'ISO B', slug: 'iso-b' })).id;

    locationAId = (
      await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'A HQ' })
    ).id;
    branchAId = (
      await branches.createBranch(tenantA, {
        name: 'A HQ Branch',
        code: 'A-HQ',
        locationId: locationAId,
      })
    ).id;
    await zones.createZone(tenantA, { name: 'A Zone' });
  });

  afterAll(async () => {
    const raw = new PrismaClient({
      adapter: new PrismaPg(new Pool({ connectionString: LOCAL_TEST_DATABASE_URL })),
    });
    await raw.tenant.deleteMany({ where: { slug: { startsWith: 'iso-' } } });
    await raw.$disconnect();
    await app.close();
  });

  it('cross-tenant reads return nothing (02-D06)', async () => {
    const scopedB = tenantScopedClient(prisma, { tenantId: tenantB });

    const branchesB = await scopedB.branch.findMany({});
    expect(branchesB).toHaveLength(0);

    const locationB = await scopedB.location.findFirst({ where: { id: locationAId } });
    expect(locationB).toBeNull();

    const zonesB = await scopedB.deliveryZone.findMany({});
    expect(zonesB).toHaveLength(0);
  });

  it('same-tenant reads see their own rows', async () => {
    const scopedA = tenantScopedClient(prisma, { tenantId: tenantA });
    const branch = await scopedA.branch.findUnique({ where: { id: branchAId } });
    expect(branch?.code).toBe('A-HQ');
  });

  it('cross-tenant writes are denied (02-D07)', async () => {
    const scopedB = tenantScopedClient(prisma, { tenantId: tenantB });

    // Direct update/delete by ID cannot cross the scope.
    const updated = await scopedB.branch.updateMany({
      where: { id: branchAId },
      data: { name: 'HACKED' },
    });
    expect(updated.count).toBe(0);

    const deleted = await scopedB.branch.deleteMany({ where: { id: branchAId } });
    expect(deleted.count).toBe(0);

    // Creating with a foreign tenantId is rejected outright.
    await expect(
      scopedB.branch.create({
        data: { tenantId: tenantA, name: 'Sneak', code: 'SNK', locationId: locationAId },
      }),
    ).rejects.toBeTruthy();
  });

  it('cross-tenant exports return nothing (02-D08)', async () => {
    const exportB = await exportTenantBranches(prisma, tenantB);
    expect(exportB).toEqual([]);

    const exportA = await exportTenantBranches(prisma, tenantA);
    expect(exportA).toEqual(['A-HQ']);
  });

  it('the unmodified tenant row still belongs to tenant A after denial attempts', async () => {
    const scopedA = tenantScopedClient(prisma, { tenantId: tenantA });
    const branch = await scopedA.branch.findUnique({ where: { id: branchAId } });
    expect(branch).toMatchObject({ name: 'A HQ Branch', tenantId: tenantA });
  });
});
