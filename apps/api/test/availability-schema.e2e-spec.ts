import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { isValidInterval, overlaps } from '../src/availability/domain/interval';
import { validateVehicleBlock } from '../src/availability/domain/blocks';

/**
 * Availability interval model — schema validation tests (04-A06).
 *
 * Proves the vehicle_blocks (04-A03) and booking_holds (04-A04) migrations
 * against a real PostgreSQL: enum enforcement, interval round-trips, cascade
 * deletes, and that the shared half-open interval contract drives the
 * domain-side validation that guards these tables.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';

describe('Availability interval schema (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const slugNamespace = 'avail-';

  beforeAll(async () => {
    const env = loadEnvSchema({
      NODE_ENV: 'test',
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      TEST_DATABASE_URL: LOCAL_TEST_DATABASE_URL,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(env)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: slugNamespace } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('stores a vehicle block interval and applies SCHEDULED by default', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();

    const startsAt = new Date('2026-09-01T08:00:00Z');
    const endsAt = new Date('2026-09-02T08:00:00Z');
    const block = await prisma.vehicleBlock.create({
      data: { tenantId, vehicleId, blockType: 'MAINTENANCE', startsAt, endsAt },
    });

    expect(block.status).toBe('SCHEDULED');
    expect(block.createdAt).toBeInstanceOf(Date);
    expect(isValidInterval(block.startsAt, block.endsAt)).toBe(true);
    // The DB preserves instants exactly (UTC round-trip).
    expect(block.startsAt.toISOString()).toBe('2026-09-01T08:00:00.000Z');
  });

  it('rejects unknown block types at the database enum level', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();

    await expect(
      prisma.vehicleBlock.create({
        data: {
          tenantId,
          vehicleId,
          blockType: 'PAINTING' as never,
          startsAt: new Date('2026-09-01T08:00:00Z'),
          endsAt: new Date('2026-09-02T08:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects unknown block statuses at the database enum level', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();

    await expect(
      prisma.vehicleBlock.create({
        data: {
          tenantId,
          vehicleId,
          blockType: 'CLEANING',
          status: 'FUTURE' as never,
          startsAt: new Date('2026-09-01T08:00:00Z'),
          endsAt: new Date('2026-09-02T08:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('cascades vehicle blocks and booking holds when the vehicle is deleted', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();

    const block = await prisma.vehicleBlock.create({
      data: {
        tenantId,
        vehicleId,
        blockType: 'INSPECTION',
        startsAt: new Date('2026-09-03T08:00:00Z'),
        endsAt: new Date('2026-09-03T18:00:00Z'),
      },
    });
    const hold = await prisma.bookingHold.create({
      data: {
        tenantId,
        vehicleId,
        startsAt: new Date('2026-09-04T08:00:00Z'),
        endsAt: new Date('2026-09-04T18:00:00Z'),
        expiresAt: new Date('2026-09-04T07:00:00Z'),
        channel: 'MARKETPLACE',
      },
    });

    await prisma.vehicle.delete({ where: { id: vehicleId } });

    await expect(prisma.vehicleBlock.findUnique({ where: { id: block.id } })).resolves.toBeNull();
    await expect(prisma.bookingHold.findUnique({ where: { id: hold.id } })).resolves.toBeNull();
  });

  it('stores booking holds with expiry, channel and ownership', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();

    const hold = await prisma.bookingHold.create({
      data: {
        tenantId,
        vehicleId,
        startsAt: new Date('2026-09-05T08:00:00Z'),
        endsAt: new Date('2026-09-05T18:00:00Z'),
        expiresAt: new Date('2026-09-05T07:30:00Z'),
        channel: 'AGENCY_WEB',
        createdBy: '00000000-0000-0000-0000-000000000001',
      },
    });

    expect(hold.status).toBe('ACTIVE');
    expect(hold.createdBy).toBe('00000000-0000-0000-0000-000000000001');
    expect(hold.expiresAt.getTime()).toBeLessThan(hold.startsAt.getTime());
  });

  it('rejects unknown hold channels at the database enum level', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();

    await expect(
      prisma.bookingHold.create({
        data: {
          tenantId,
          vehicleId,
          startsAt: new Date('2026-09-06T08:00:00Z'),
          endsAt: new Date('2026-09-06T18:00:00Z'),
          expiresAt: new Date('2026-09-06T07:00:00Z'),
          channel: 'TELEGRAM' as never,
        },
      }),
    ).rejects.toThrow();
  });

  it('validates block intervals with the shared domain contract before persistence', () => {
    const start = new Date('2026-09-01T08:00:00Z');
    const end = new Date('2026-09-02T08:00:00Z');

    expect(validateVehicleBlock(start, end, 'MAINTENANCE', 'SCHEDULED')).toEqual([]);
    expect(validateVehicleBlock(end, start, 'MAINTENANCE', 'SCHEDULED')).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'interval' })]),
    );

    const backToBack = {
      a: { start, end },
      b: { start: end, end: new Date('2026-09-03T08:00:00Z') },
    };
    expect(overlaps(backToBack.a, backToBack.b)).toBe(false);
  });

  async function createTenantAndVehicle(): Promise<{ tenantId: string; vehicleId: string }> {
    const slug = `${slugNamespace}${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await prisma.tenant.create({ data: { name: `Avail ${slug}`, slug } });
    const category = await prisma.vehicleCategory.create({
      data: { tenantId: tenant.id, code: 'BASE', name: 'Base' },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        plateNumber: `AV${Date.now() % 1000000}`,
      },
    });
    return { tenantId: tenant.id, vehicleId: vehicle.id };
  }
});
