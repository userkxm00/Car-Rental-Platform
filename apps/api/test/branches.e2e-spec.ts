import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { BranchesService } from '../src/locations/application/branches.service';
import { DeliveryZonesService } from '../src/locations/application/delivery-zones.service';
import { LocationsService } from '../src/locations/application/locations.service';
import { TenantService } from '../src/tenants/application/tenant.service';

/**
 * Branches & locations integration tests (02-C): constraints, hours,
 * exceptions, contacts, location types and delivery zones over real
 * PostgreSQL. The suite owns the `lct-` slug namespace.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';

describe('Branches & locations (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tenants: TenantService;
  let branches: BranchesService;
  let locations: LocationsService;
  let zones: DeliveryZonesService;

  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = LOCAL_TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    tenants = app.get(TenantService);
    branches = app.get(BranchesService);
    locations = app.get(LocationsService);
    zones = app.get(DeliveryZonesService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    tenantA = (await tenants.create({ name: 'LCT A', slug: 'lct-a' })).id;
    tenantB = (await tenants.create({ name: 'LCT B', slug: 'lct-b' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'lct-' } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('creates tenant-owned and global canonical locations (02-C02/07)', async () => {
    const branchLoc = await locations.createLocation({
      tenantId: tenantA,
      type: 'BRANCH',
      name: 'Oran Center',
      city: 'Oran',
      region: 'Oran',
      countryCode: 'DZ',
      latitude: 35.6911,
      longitude: -0.6416,
    });
    expect(branchLoc).toMatchObject({ type: 'BRANCH', city: 'Oran', tenantId: tenantA });

    const airport = await locations.createLocation({
      type: 'AIRPORT',
      name: 'Algiers Airport',
      city: 'Algiers',
      countryCode: 'DZ',
    });
    expect(airport).toMatchObject({ type: 'AIRPORT', tenantId: null });
  });

  it('creates a branch referencing its own tenant location (02-C01)', async () => {
    const loc = await locations.createLocation({
      tenantId: tenantA,
      type: 'BRANCH',
      name: 'Tlemcen Rd',
    });
    const branch = await branches.createBranch(tenantA, {
      name: 'Tlemcen Road Branch',
      code: 'TLM-01',
      locationId: loc.id,
      timezone: 'Africa/Algiers',
      contacts: { phone: '+213000000000', email: 'branch@example.com' },
    });
    expect(branch).toMatchObject({ code: 'TLM-01', status: 'ACTIVE', tenantId: tenantA });
  });

  it('allows a branch to reference a global location', async () => {
    const airport = await locations.createLocation({ type: 'AIRPORT', name: 'Oran Es Senia' });
    const branch = await branches.createBranch(tenantB, {
      name: 'Airport Desk',
      code: 'AP-01',
      locationId: airport.id,
    });
    expect(branch.locationId).toBe(airport.id);
  });

  it('rejects a branch referencing another tenant’s location (02-C03)', async () => {
    const foreignLoc = await locations.createLocation({
      tenantId: tenantB,
      type: 'BRANCH',
      name: 'B Only',
    });
    await expect(
      branches.createBranch(tenantA, {
        name: 'Sneaky',
        code: 'SNK-01',
        locationId: foreignLoc.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_TENANT_MISMATCH' } });
  });

  it('enforces unique branch codes per tenant, but allows reuse across tenants (02-C03)', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'A1' });
    await branches.createBranch(tenantA, { name: 'A1', code: 'SH-01', locationId: loc.id });
    await expect(
      branches.createBranch(tenantA, { name: 'A1 dup', code: 'SH-01', locationId: loc.id }),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_CODE_TAKEN' } });

    const locB = await locations.createLocation({ tenantId: tenantB, type: 'BRANCH', name: 'B1' });
    const other = await branches.createBranch(tenantB, {
      name: 'B1',
      code: 'SH-01',
      locationId: locB.id,
    });
    expect(other.code).toBe('SH-01');
  });

  it('validates branch inputs (code shape, name, contacts, timezone)', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'V1' });
    await expect(
      branches.createBranch(tenantA, { name: 'Bad Code', code: 'bad code', locationId: loc.id }),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_VALIDATION_FAILED' } });
    await expect(
      branches.createBranch(tenantA, {
        name: 'Bad TZ',
        code: 'TZ-01',
        locationId: loc.id,
        timezone: 'not-a-zone',
      }),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_VALIDATION_FAILED' } });
  });

  it('manages branch lifecycle: suspend → reactivate → archive terminal', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'LC' });
    const branch = await branches.createBranch(tenantA, {
      name: 'LC',
      code: 'LC-01',
      locationId: loc.id,
    });

    const suspended = await branches.setStatus(tenantA, branch.id, 'SUSPENDED');
    expect(suspended.status).toBe('SUSPENDED');
    const active = await branches.setStatus(tenantA, branch.id, 'ACTIVE');
    expect(active.status).toBe('ACTIVE');
    const archived = await branches.setStatus(tenantA, branch.id, 'ARCHIVED');
    expect(archived.status).toBe('ARCHIVED');
    // ARCHIVED is terminal.
    await expect(branches.setStatus(tenantA, branch.id, 'ACTIVE')).rejects.toMatchObject({
      response: { code: 'BRANCH_VALIDATION_FAILED' },
    });
  });

  it('updates branch contacts with key validation (02-C06)', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'CT' });
    const branch = await branches.createBranch(tenantA, {
      name: 'CT',
      code: 'CT-01',
      locationId: loc.id,
    });
    const updated = await branches.setContacts(tenantA, branch.id, {
      phone: '+213111111111',
      whatsapp: '+213111111111',
      notes: 'Main desk',
    });
    expect(updated.contacts).toMatchObject({ whatsapp: '+213111111111' });
    await expect(
      branches.setContacts(tenantA, branch.id, { bogus: 'x' } as never),
    ).rejects.toMatchObject({ response: { code: 'BRANCH_VALIDATION_FAILED' } });
  });

  it('sets, lists and deletes recurring hours (02-C04)', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'HRS' });
    await locations.setHours(tenantA, loc.id, 0, '08:00', '18:00');
    await locations.setHours(tenantA, loc.id, 6, '09:00', '13:00');

    const hours = await locations.listHours(tenantA, loc.id);
    expect(hours).toHaveLength(2);
    expect(hours.find((h) => h.dayOfWeek === 0)).toMatchObject({
      opensAt: '08:00',
      closesAt: '18:00',
    });

    await locations.deleteHours(tenantA, loc.id, 6);
    expect(await locations.listHours(tenantA, loc.id)).toHaveLength(1);
  });

  it('rejects invalid hour values (02-C04)', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'BADH' });
    await expect(locations.setHours(tenantA, loc.id, 7, '08:00', '18:00')).rejects.toMatchObject({
      response: { code: 'HOURS_VALIDATION_FAILED' },
    });
    await expect(locations.setHours(tenantA, loc.id, 1, '18:00', '08:00')).rejects.toMatchObject({
      response: { code: 'HOURS_VALIDATION_FAILED' },
    });
    await expect(locations.setHours(tenantA, loc.id, 1, '8:00', '18:00')).rejects.toMatchObject({
      response: { code: 'HOURS_VALIDATION_FAILED' },
    });
  });

  it('manages exception hours, including closed-all-day (02-C05)', async () => {
    const loc = await locations.createLocation({ tenantId: tenantA, type: 'BRANCH', name: 'EXC' });
    const holiday = new Date('2026-11-01T00:00:00Z');
    await locations.setException(tenantA, loc.id, holiday, null, null, 'National holiday');
    const exceptions = await locations.listExceptions(tenantA, loc.id);
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({
      opensAt: null,
      closesAt: null,
      reason: 'National holiday',
    });

    // Same date replaces the exception (unique per location+date).
    await locations.setException(tenantA, loc.id, holiday, '10:00', '14:00');
    const replaced = await locations.listExceptions(tenantA, loc.id);
    expect(replaced[0]).toMatchObject({ opensAt: '10:00', closesAt: '14:00' });

    await locations.deleteException(tenantA, loc.id, holiday);
    expect(await locations.listExceptions(tenantA, loc.id)).toHaveLength(0);
  });

  it('tenant-scopes reads: other tenants cannot see the location', async () => {
    const loc = await locations.createLocation({
      tenantId: tenantA,
      type: 'BRANCH',
      name: 'Private A',
    });
    await expect(locations.getLocation(tenantB, loc.id)).rejects.toMatchObject({
      response: { code: 'LOCATION_NOT_FOUND' },
    });
    await expect(locations.listHours(tenantB, loc.id)).rejects.toMatchObject({
      response: { code: 'LOCATION_NOT_FOUND' },
    });
  });

  it('manages the delivery-zone baseline (02-C08)', async () => {
    const zone = await zones.createZone(tenantA, {
      name: 'Oran City',
      feePolicyReference: 'fee-zone-1',
    });
    expect(zone).toMatchObject({
      active: true,
      tenantId: tenantA,
      feePolicyReference: 'fee-zone-1',
    });

    const listed = await zones.listZones(tenantA);
    expect(listed.some((z) => z.id === zone.id)).toBe(true);
    expect((await zones.listZones(tenantB)).some((z) => z.id === zone.id)).toBe(false);

    const inactive = await zones.setZoneActive(tenantA, zone.id, false);
    expect(inactive.active).toBe(false);
    await expect(zones.setZoneActive(tenantB, zone.id, true)).rejects.toBeTruthy();
  });
});
