import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import {
  assertIntervalFree,
  IntervalConflictError,
  withVehicleCommitmentLock,
} from '../src/availability/infrastructure/commitment-guard';

/**
 * Conflict protection integration tests (04-B06): real concurrent
 * transactions over real PostgreSQL prove that overlapping commitments can
 * never both persist — through the per-vehicle row lock + explicit check,
 * with the database exclusion constraints (04-B02) as the backstop.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';

describe('Conflict protection (integration)', () => {
  /** Future instants relative to now (date-rot-proof, 04-B semantics kept). */
  const at = (hours: number): Date => new Date(Date.now() + hours * 3600_000);

  let app: INestApplication;
  let prisma: PrismaClient;
  const slugNamespace = 'conf-';

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

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL, max: 10 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: slugNamespace } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('allows back-to-back commitment intervals (half-open boundary)', async () => {
    const { vehicleId } = await createTenantAndVehicle();
    const first = { start: at(24), end: at(26) };
    const second = { start: first.end, end: at(28) };

    await withVehicleCommitmentLock(prisma, vehicleId, async (tx) =>
      tx.bookingHold.create({
        data: {
          tenantId: (await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).tenantId,
          vehicleId,
          startsAt: first.start,
          endsAt: first.end,
          expiresAt: new Date(first.end.getTime() - 60_000),
          channel: 'STAFF',
        },
      }),
    );
    await withVehicleCommitmentLock(prisma, vehicleId, async (tx) =>
      tx.bookingHold.create({
        data: {
          tenantId: (await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).tenantId,
          vehicleId,
          startsAt: second.start,
          endsAt: second.end,
          expiresAt: new Date(second.end.getTime() - 60_000),
          channel: 'STAFF',
        },
      }),
    );

    const holds = await prisma.bookingHold.count({ where: { vehicleId, status: 'ACTIVE' } });
    expect(holds).toBe(2);
  });

  it('never persists two overlapping commitments under concurrency', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();
    const interval = { start: at(48), end: at(58) };
    const overlapping = { start: at(49), end: at(59) };

    const createHold = (candidate: typeof interval) =>
      withVehicleCommitmentLock(prisma, vehicleId, async (tx) => {
        await assertIntervalFree(tx, vehicleId, candidate);
        return tx.bookingHold.create({
          data: {
            tenantId,
            vehicleId,
            startsAt: candidate.start,
            endsAt: candidate.end,
            expiresAt: new Date(candidate.end.getTime() - 60_000),
            channel: 'MARKETPLACE',
          },
        });
      });

    const results = await Promise.allSettled([createHold(interval), createHold(overlapping)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failed = rejected[0];
    if (failed.status !== 'rejected') {
      throw new Error('expected a rejection');
    }
    expect(failed.reason).toBeInstanceOf(IntervalConflictError);

    const active = await prisma.bookingHold.count({ where: { vehicleId, status: 'ACTIVE' } });
    expect(active).toBe(1);
  });

  it('lets a block exclusion free the interval once it becomes inert', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();
    const interval = { start: at(48), end: at(58) };

    const block = await prisma.vehicleBlock.create({
      data: { tenantId, vehicleId, blockType: 'MAINTENANCE', startsAt: interval.start, endsAt: interval.end },
    });

    // While SCHEDULED the block conflicts…
    await expect(assertIntervalFree(prisma, vehicleId, interval)).rejects.toBeInstanceOf(
      IntervalConflictError,
    );

    // …once CANCELLED the exclusion predicate no longer applies.
    await prisma.vehicleBlock.update({ where: { id: block.id }, data: { status: 'CANCELLED' } });

    await prisma.$transaction(async (tx) => {
      await assertIntervalFree(tx, vehicleId, interval);
      await tx.bookingHold.create({
        data: {
          tenantId,
          vehicleId,
          startsAt: interval.start,
          endsAt: interval.end,
          expiresAt: new Date(interval.end.getTime() - 60_000),
          channel: 'AGENCY_WEB',
        },
      });
    });
  });

  it('expires stale ACTIVE holds so they cannot block new commitments (04-B05)', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();
    const past = { start: at(-24 * 20), end: at(-24 * 20 + 10) };

    await prisma.bookingHold.create({
      data: {
        tenantId,
        vehicleId,
        startsAt: past.start,
        endsAt: past.end,
        expiresAt: at(-24 * 20 + 9),
        channel: 'STAFF',
      },
    });

    const fresh = { start: at(48), end: at(58) };
    await withVehicleCommitmentLock(prisma, vehicleId, async (tx) => {
      await assertIntervalFree(tx, vehicleId, fresh);
      await tx.bookingHold.create({
        data: {
          tenantId,
          vehicleId,
          startsAt: fresh.start,
          endsAt: fresh.end,
          expiresAt: new Date(fresh.end.getTime() - 60_000),
          channel: 'STAFF',
        },
      });
    });

    const stale = await prisma.bookingHold.findFirst({
      where: { vehicleId, startsAt: past.start },
    });
    expect(stale?.status).toBe('EXPIRED');
  });

  it('rejects overlapping vehicle blocks at the database constraint level', async () => {
    const { tenantId, vehicleId } = await createTenantAndVehicle();
    const interval = { start: at(48), end: at(58) };

    await prisma.vehicleBlock.create({
      data: { tenantId, vehicleId, blockType: 'INSPECTION', startsAt: interval.start, endsAt: interval.end },
    });

    await expect(
      prisma.vehicleBlock.create({
        data: {
          tenantId,
          vehicleId,
          blockType: 'DAMAGE',
          startsAt: at(49),
          endsAt: at(59),
        },
      }),
    ).rejects.toThrow(/vehicle_blocks_no_overlap/);
  });

  async function createTenantAndVehicle(): Promise<{ tenantId: string; vehicleId: string }> {
    const slug = `${slugNamespace}${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const tenant = await prisma.tenant.create({ data: { name: `Conf ${slug}`, slug } });
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
        plateNumber: `CF${Date.now() % 1000000}`,
      },
    });
    return { tenantId: tenant.id, vehicleId: vehicle.id };
  }
});
