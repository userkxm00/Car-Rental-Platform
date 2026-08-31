import { ConflictException, NotFoundException } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import type { AvailabilityRepository } from '../infrastructure/availability.repository';
import { AvailabilityReasonCode } from '../domain/availability-query';

/**
 * Availability query logic tests (04-C01…C06): reason computation, branch
 * constraints, capacity math and boundary validation — against a fake
 * repository (the SQL itself is covered by the e2e suite).
 */

function makeRepository(overrides: Partial<AvailabilityRepository> = {}): AvailabilityRepository {
  return {
    findVehicleInTenant: jest.fn(),
    findCategoryInTenant: jest.fn(),
    findConflictingBlocks: jest.fn().mockResolvedValue([]),
    findConflictingHolds: jest.fn().mockResolvedValue([]),
    listAvailable: jest.fn().mockResolvedValue([]),
    countEligible: jest.fn().mockResolvedValue(0),
    countCommitted: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as AvailabilityRepository;
}

const interval = {
  start: new Date('2026-09-01T08:00:00Z'),
  end: new Date('2026-09-01T18:00:00Z'),
};

describe('AvailabilityService.vehicleAvailability', () => {
  it('reports available when the vehicle has no conflicting commitments', async () => {
    const repo = makeRepository({
      findVehicleInTenant: jest
        .fn()
        .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
    });
    const service = new AvailabilityService(repo);

    const result = await service.vehicleAvailability('ag1', 'v1', interval, {});

    expect(result.available).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.constraintsApplied).toEqual(['fleetLifecycle', 'blocks', 'holds']);
  });

  it('rejects archived vehicles with a structured reason', async () => {
    const repo = makeRepository({
      findVehicleInTenant: jest
        .fn()
        .mockResolvedValue({ id: 'v1', status: 'ARCHIVED', currentBranchId: null }),
    });
    const service = new AvailabilityService(repo);

    const result = await service.vehicleAvailability('ag1', 'v1', interval, {});
    expect(result.available).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: AvailabilityReasonCode.VEHICLE_ARCHIVED })]),
    );
  });

  it('reports maintenance and inspection blocks as BLOCK_CONFLICT with the block type (04-C04/05)', async () => {
    const repo = makeRepository({
      findVehicleInTenant: jest
        .fn()
        .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      findConflictingBlocks: jest.fn().mockResolvedValue([
        { id: 'b1', blockType: 'MAINTENANCE' },
        { id: 'b2', blockType: 'INSPECTION' },
      ]),
    });
    const service = new AvailabilityService(repo);

    const result = await service.vehicleAvailability('ag1', 'v1', interval, {});
    expect(result.available).toBe(false);
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: 'BLOCK_CONFLICT', blockType: 'MAINTENANCE', commitmentId: 'b1' }),
      expect.objectContaining({ code: 'BLOCK_CONFLICT', blockType: 'INSPECTION', commitmentId: 'b2' }),
    ]);
  });

  it('reports live holds as HOLD_CONFLICT', async () => {
    const repo = makeRepository({
      findVehicleInTenant: jest
        .fn()
        .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      findConflictingHolds: jest.fn().mockResolvedValue([{ id: 'h1' }]),
    });
    const service = new AvailabilityService(repo);

    const result = await service.vehicleAvailability('ag1', 'v1', interval, {});
    expect(result.reasons).toEqual([
      expect.objectContaining({ code: 'HOLD_CONFLICT', commitmentId: 'h1' }),
    ]);
  });

  it('applies the pickup-branch constraint but lets pool vehicles through (04-C03)', async () => {
    const service = new AvailabilityService(
      makeRepository({
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: 'branch-b' }),
      }),
    );
    const assignedElsewhere = await service.vehicleAvailability('ag1', 'v1', interval, {
      pickupBranchId: 'branch-a',
    });
    expect(assignedElsewhere.available).toBe(false);
    expect(assignedElsewhere.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'VEHICLE_AT_OTHER_BRANCH' })]),
    );
    expect(assignedElsewhere.constraintsApplied).toContain('pickupBranch');

    const poolService = new AvailabilityService(
      makeRepository({
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      }),
    );
    const poolVehicle = await poolService.vehicleAvailability('ag1', 'v1', interval, {
      pickupBranchId: 'branch-a',
    });
    expect(poolVehicle.available).toBe(true);
  });

  it('carries return-branch and delivery-zone constraints as pending (04-C06)', async () => {
    const service = new AvailabilityService(
      makeRepository({
        findVehicleInTenant: jest
          .fn()
          .mockResolvedValue({ id: 'v1', status: 'AVAILABLE', currentBranchId: null }),
      }),
    );

    const result = await service.vehicleAvailability('ag1', 'v1', interval, {
      returnBranchId: 'branch-r',
      deliveryZoneId: 'zone-1',
    });
    expect(result.available).toBe(true);
    expect(result.constraintsPending).toEqual(['returnBranch', 'deliveryZone']);
  });

  it('throws NOT_FOUND for vehicles outside the tenant', async () => {
    const service = new AvailabilityService(
      makeRepository({ findVehicleInTenant: jest.fn().mockResolvedValue(null) }),
    );
    await expect(service.vehicleAvailability('ag1', 'other', interval, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AvailabilityService.categoryCapacity (04-C02)', () => {
  it('computes available as eligible minus committed, never negative', async () => {
    const service = new AvailabilityService(
      makeRepository({
        findCategoryInTenant: jest.fn().mockResolvedValue({ id: 'c1', active: true }),
        countEligible: jest.fn().mockResolvedValue(5),
        countCommitted: jest.fn().mockResolvedValue(2),
      }),
    );
    const result = await service.categoryCapacity('ag1', 'c1', interval, {});
    expect(result).toMatchObject({ eligible: 5, committed: 2, available: 3 });
  });

  it('throws NOT_FOUND for categories outside the tenant', async () => {
    const service = new AvailabilityService(
      makeRepository({ findCategoryInTenant: jest.fn().mockResolvedValue(null) }),
    );
    await expect(service.categoryCapacity('ag1', 'other', interval, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('AvailabilityService.validateRequestInterval (04-A05 boundary)', () => {
  const service = new AvailabilityService(makeRepository());

  it('accepts instants with offsets and normalizes to UTC', () => {
    const result = service.validateRequestInterval('2026-09-01T09:00:00+01:00', '2026-09-01T18:00:00Z');
    expect(result.start.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-09-01T18:00:00.000Z');
  });

  it('rejects missing parameters', () => {
    expect(() => service.validateRequestInterval(undefined, '2026-09-01T18:00:00Z')).toThrow(
      ConflictException,
    );
  });

  it('rejects zone-less naive datetimes', () => {
    expect(() =>
      service.validateRequestInterval('2026-09-01T09:00:00', '2026-09-01T18:00:00'),
    ).toThrow(ConflictException);
  });

  it('rejects inverted and zero-length intervals', () => {
    expect(() =>
      service.validateRequestInterval('2026-09-01T18:00:00Z', '2026-09-01T08:00:00Z'),
    ).toThrow(ConflictException);
    expect(() =>
      service.validateRequestInterval('2026-09-01T08:00:00Z', '2026-09-01T08:00:00Z'),
    ).toThrow(ConflictException);
  });
});

describe('AvailabilityService.scheduleTimeline (04-D01…D05)', () => {
  it('serializes the window and groups commitments per vehicle', async () => {
    const repo = makeRepository({
      scheduleCommitments: jest.fn().mockResolvedValue([
        {
          vehicleId: 'v1',
          make: 'Toyota',
          model: 'Corolla',
          plateNumber: '111-222-16',
          currentBranchId: 'branch-a',
          commitments: [
            {
              id: 'b1',
              kind: 'BLOCK',
              blockType: 'MAINTENANCE',
              status: 'SCHEDULED',
              start: new Date('2026-09-01T08:00:00Z'),
              end: new Date('2026-09-01T10:00:00Z'),
              reason: 'oil change',
            },
          ],
        },
      ]),
    });
    const service = new AvailabilityService(repo);

    const result = await service.scheduleTimeline('ag1', interval, {});

    expect(result.start).toBe('2026-09-01T08:00:00.000Z');
    expect(result.end).toBe('2026-09-01T18:00:00.000Z');
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]).toMatchObject({
      vehicleId: 'v1',
      make: 'Toyota',
      model: 'Corolla',
      plateNumber: '111-222-16',
      currentBranchId: 'branch-a',
    });
    expect(result.vehicles[0].commitments[0]).toMatchObject({
      id: 'b1',
      kind: 'BLOCK',
      blockType: 'MAINTENANCE',
      status: 'SCHEDULED',
      start: '2026-09-01T08:00:00.000Z',
      end: '2026-09-01T10:00:00.000Z',
      reason: 'oil change',
      conflicting: false,
    });
  });

  it('flags a live block and a live hold that overlap as conflicting on both sides (04-D03)', async () => {
    const repo = makeRepository({
      scheduleCommitments: jest.fn().mockResolvedValue([
        {
          vehicleId: 'v1',
          make: 'Toyota',
          model: 'Corolla',
          plateNumber: '111-222-16',
          currentBranchId: null,
          commitments: [
            {
              id: 'b1',
              kind: 'BLOCK',
              blockType: 'MANUAL',
              status: 'ACTIVE',
              start: new Date('2026-09-01T08:00:00Z'),
              end: new Date('2026-09-01T12:00:00Z'),
              reason: null,
            },
            {
              id: 'h1',
              kind: 'HOLD',
              blockType: null,
              status: 'ACTIVE',
              start: new Date('2026-09-01T10:00:00Z'),
              end: new Date('2026-09-01T14:00:00Z'),
              reason: null,
            },
          ],
        },
      ]),
    });
    const service = new AvailabilityService(repo);

    const result = await service.scheduleTimeline('ag1', interval, {});

    const [block, hold] = result.vehicles[0].commitments;
    expect(block.conflicting).toBe(true);
    expect(hold.conflicting).toBe(true);
  });

  it('does not flag conflicts against expired holds or cancelled blocks', async () => {
    const past = new Date(Date.now() - 60_000);
    const repo = makeRepository({
      scheduleCommitments: jest.fn().mockResolvedValue([
        {
          vehicleId: 'v1',
          make: 'Toyota',
          model: 'Corolla',
          plateNumber: '111-222-16',
          currentBranchId: null,
          commitments: [
            {
              id: 'b1',
              kind: 'BLOCK',
              blockType: 'MANUAL',
              status: 'ACTIVE',
              start: new Date('2026-09-01T08:00:00Z'),
              end: new Date('2026-09-01T12:00:00Z'),
              reason: null,
            },
            {
              id: 'h1',
              kind: 'HOLD',
              blockType: null,
              status: 'ACTIVE',
              start: new Date('2026-09-01T10:00:00Z'),
              end: past,
              reason: null,
            },
            {
              id: 'b2',
              kind: 'BLOCK',
              blockType: 'MAINTENANCE',
              status: 'CANCELLED',
              start: new Date('2026-09-01T08:00:00Z'),
              end: new Date('2026-09-01T13:00:00Z'),
              reason: null,
            },
          ],
        },
      ]),
    });
    const service = new AvailabilityService(repo);

    const result = await service.scheduleTimeline('ag1', interval, {});

    expect(result.vehicles[0].commitments.map((c) => c.conflicting)).toEqual([false, false, false]);
  });

  it('does not flag block-block overlaps (only the guard-protected BLOCK x HOLD pair conflicts)', async () => {
    const repo = makeRepository({
      scheduleCommitments: jest.fn().mockResolvedValue([
        {
          vehicleId: 'v1',
          make: 'Toyota',
          model: 'Corolla',
          plateNumber: '111-222-16',
          currentBranchId: null,
          commitments: [
            {
              id: 'b1',
              kind: 'BLOCK',
              blockType: 'MAINTENANCE',
              status: 'SCHEDULED',
              start: new Date('2026-09-01T08:00:00Z'),
              end: new Date('2026-09-01T12:00:00Z'),
              reason: null,
            },
            {
              id: 'b2',
              kind: 'BLOCK',
              blockType: 'MANUAL',
              status: 'SCHEDULED',
              start: new Date('2026-09-01T10:00:00Z'),
              end: new Date('2026-09-01T14:00:00Z'),
              reason: null,
            },
          ],
        },
      ]),
    });
    const service = new AvailabilityService(repo);

    const result = await service.scheduleTimeline('ag1', interval, {});

    expect(result.vehicles[0].commitments.map((c) => c.conflicting)).toEqual([false, false]);
  });

  it('forwards the vehicle and branch filters to the repository (04-D04/D05)', async () => {
    const scheduleCommitments = jest.fn().mockResolvedValue([]);
    const service = new AvailabilityService(makeRepository({ scheduleCommitments }));

    await service.scheduleTimeline('ag1', interval, { vehicleId: 'v1', branchId: 'branch-a' });

    expect(scheduleCommitments).toHaveBeenCalledWith('ag1', interval, {
      vehicleId: 'v1',
      branchId: 'branch-a',
    });
  });
});
