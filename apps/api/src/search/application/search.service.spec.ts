import { ConflictException } from '@nestjs/common';
import { SearchService } from './search.service';
import type { MarketplaceRepository, OfferBranchRow, OfferVehicleRow } from '../infrastructure/marketplace.repository';
import type { AvailabilityService } from '../../availability/application/availability.service';
import type { QuotePricingPort } from '../../quotes/application/ports/quote-pricing.port';
import { QUOTE_PRICING_NOT_CONFIGURED_CODE } from '../../quotes/application/ports/quote-pricing.port';

type FakeRepository = { [K in keyof MarketplaceRepository]: jest.Mock };
type FakeAvailability = { [K in keyof AvailabilityService]: jest.Mock };
type FakePricing = { [K in keyof QuotePricingPort]: jest.Mock };

const NOW = new Date('2026-09-01T10:00:00.000Z');

const branchRow = (overrides: Partial<OfferBranchRow> = {}): OfferBranchRow => ({
  id: 'branch-1',
  name: 'Agence Centre',
  location: { id: 'loc-1', city: 'Oran', latitude: 35.7, longitude: -0.63 },
  ...overrides,
});

const vehicleRow = (overrides: Partial<OfferVehicleRow> = {}): OfferVehicleRow => ({
  id: 'vehicle-1',
  make: 'Dacia',
  model: 'Logan',
  year: 2024,
  plateNumber: 'P-123',
  currentBranchId: 'branch-1',
  category: {
    id: 'cat-1',
    name: 'Economy',
    transmission: 'MANUAL',
    fuelType: 'DIESEL',
    seats: 5,
    features: [{ featureKey: 'air_conditioning' }, { featureKey: 'bluetooth' }],
  },
  currentBranch: branchRow(),
  ...overrides,
});

const pricingPayload = (totalMinor: number) => ({
  currency: 'DZD',
  totalMinor,
  breakdown: [{ code: 'RENTAL', amountMinor: totalMinor }],
  depositMinor: 0,
  calculatedAt: NOW.toISOString(),
});

function makeService(
  repo: FakeRepository,
  availability: FakeAvailability,
  pricing?: FakePricing,
): SearchService {
  return new SearchService(
    repo as unknown as MarketplaceRepository,
    availability as unknown as AvailabilityService,
    pricing ? (pricing) : undefined,
  );
}

function baseRepo(): FakeRepository {
  return {
    listEnabledAgencies: jest.fn(),
    findBranchAtLocation: jest.fn(),
    findBranchesByCity: jest.fn(),
    listOfferVehicles: jest.fn(),
    listBranchLocations: jest.fn(),
    toOfferBranch: jest.fn(),
  };
}

function baseAvailability(): FakeAvailability {
  return {
    listAvailableVehicles: jest.fn(),
  } as unknown as FakeAvailability;
}

function basePricing(totalMinor = 5000): FakePricing {
  return {
    computeQuotePricing: jest.fn().mockResolvedValue(pricingPayload(totalMinor)),
  };
}

const QUERY = { start: '2026-10-01T09:00:00.000Z', end: '2026-10-05T09:00:00.000Z' };

describe('SearchService (07-B)', () => {
  it('returns empty results when no agencies participate (07-B11)', async () => {
    const repo = baseRepo();
    repo.listEnabledAgencies.mockResolvedValue([]);
    const service = makeService(repo, baseAvailability(), basePricing());
    const response = await service.searchOffers(QUERY, NOW);
    expect(response).toMatchObject({ items: [], total: 0, sort: 'price_asc' });
    expect(response.filters.pickupCity).toBeNull();
  });

  it('maps validation failures to the stable 409 envelope', async () => {
    const repo = baseRepo();
    const service = makeService(repo, baseAvailability(), basePricing());
    const failure = await service
      .searchOffers({}, NOW)
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((failure as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_INTERVAL' });
  });

  it('composes offers through availability and pricing', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    const pricing = basePricing(4500);
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'Agence Oran', slug: 'agence-oran' }]);
    availability.listAvailableVehicles.mockResolvedValue({
      start: '2026-10-01T09:00:00.000Z',
      end: '2026-10-05T09:00:00.000Z',
      vehicles: [
        { id: 'vehicle-1', categoryId: 'cat-1', currentBranchId: 'branch-1', make: 'Dacia', model: 'Logan', year: 2024, plateNumber: 'P-123' },
      ],
      total: 1,
    });
    repo.listOfferVehicles.mockResolvedValue([vehicleRow()]);
    const service = makeService(repo, availability, pricing);

    const response = await service.searchOffers(QUERY, NOW);
    expect(response.total).toBe(1);
    expect(response.items[0]).toMatchObject({
      agency: { id: 'tenant-1', slug: 'agence-oran' },
      vehicle: { id: 'vehicle-1', category: { features: ['air_conditioning', 'bluetooth'] } },
      pricing: { totalMinor: 4500 },
    });
    expect(response.items[0].pickupBranch?.location.city).toBe('Oran');
    // Category-scoped rate plans must apply: the pricing port receives
    // both the vehicle and its category.
    expect(pricing.computeQuotePricing).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'VEHICLE', vehicleId: 'vehicle-1', categoryId: 'cat-1' }),
    );
  });

  it('excludes unpriced vehicles (no rate plan applies)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    const pricing = basePricing();
    pricing.computeQuotePricing.mockRejectedValue(
      new ConflictException({ code: QUOTE_PRICING_NOT_CONFIGURED_CODE, message: 'No plan.' }),
    );
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'A', slug: 'a' }]);
    availability.listAvailableVehicles.mockResolvedValue({
      start: 'x',
      end: 'y',
      vehicles: [{ id: 'vehicle-1', categoryId: 'c', currentBranchId: null, make: 'M', model: 'm', year: 2024, plateNumber: 'p' }],
      total: 1,
    });
    repo.listOfferVehicles.mockResolvedValue([vehicleRow({ currentBranchId: null, currentBranch: null })]);
    const service = makeService(repo, availability, pricing);
    const response = await service.searchOffers(QUERY, NOW);
    expect(response.items).toEqual([]);
    expect(response.total).toBe(0);
  });

  it('propagates unexpected pricing errors instead of dropping offers', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    const pricing = basePricing();
    pricing.computeQuotePricing.mockRejectedValue(new Error('boom'));
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'A', slug: 'a' }]);
    availability.listAvailableVehicles.mockResolvedValue({
      start: 'x',
      end: 'y',
      vehicles: [{ id: 'vehicle-1', categoryId: 'c', currentBranchId: null, make: 'M', model: 'm', year: 2024, plateNumber: 'p' }],
      total: 1,
    });
    repo.listOfferVehicles.mockResolvedValue([vehicleRow()]);
    const service = makeService(repo, availability, pricing);
    await expect(service.searchOffers(QUERY as never, NOW)).rejects.toThrow('boom');
  });

  it('skips agencies without a matching pickup point (07-B02)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    repo.listEnabledAgencies.mockResolvedValue([
      { id: 'tenant-1', name: 'Served', slug: 'served' },
      { id: 'tenant-2', name: 'NotServed', slug: 'not-served' },
    ]);
    repo.findBranchAtLocation.mockImplementation((tenantId: string) =>
      Promise.resolve(tenantId === 'tenant-1' ? branchRow() : undefined),
    );
    availability.listAvailableVehicles.mockResolvedValue({
      start: 'x',
      end: 'y',
      vehicles: [{ id: 'vehicle-1', categoryId: 'c', currentBranchId: 'branch-1', make: 'M', model: 'm', year: 2024, plateNumber: 'p' }],
      total: 1,
    });
    repo.listOfferVehicles.mockResolvedValue([vehicleRow()]);
    const service = makeService(repo, availability, basePricing());
    const response = await service.searchOffers(
      { ...QUERY, pickupLocationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      NOW,
    );
    expect(response.total).toBe(1);
    expect(response.items[0].agency.id).toBe('tenant-1');
    expect(availability.listAvailableVehicles).toHaveBeenCalledTimes(1);
    // The unavailable agency was never queried for availability.
    expect(availability.listAvailableVehicles).toHaveBeenCalledWith(
      'tenant-1',
      { start: expect.any(Date) as Date, end: expect.any(Date) as Date },
      { pickupBranchId: 'branch-1' },
      { categoryId: undefined },
    );
  });

  it('applies price, feature and category filters (07-B04/B05/B06)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    const pricing = basePricing();
    const expensive = pricingPayload(99000);
    pricing.computeQuotePricing.mockResolvedValueOnce(pricingPayload(4500)).mockResolvedValueOnce(expensive);
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'A', slug: 'a' }]);
    availability.listAvailableVehicles.mockResolvedValue({
      start: 'x',
      end: 'y',
      vehicles: [
        { id: 'vehicle-1', categoryId: 'c', currentBranchId: null, make: 'M', model: 'm', year: 2024, plateNumber: 'p' },
        { id: 'vehicle-2', categoryId: 'c', currentBranchId: null, make: 'M', model: 'm2', year: 2024, plateNumber: 'p2' },
      ],
      total: 2,
    });
    repo.listOfferVehicles.mockResolvedValue([
      vehicleRow(),
      vehicleRow({
        id: 'vehicle-2',
        plateNumber: 'P-456',
        category: {
          id: 'cat-2',
          name: 'SUV',
          transmission: 'AUTOMATIC',
          fuelType: 'PETROL',
          seats: 7,
          features: [{ featureKey: 'gps_navigation' }],
        },
      }),
    ]);
    const service = makeService(repo, availability, pricing);

    const priceFiltered = await service.searchOffers(
      { ...QUERY, priceMaxMinor: '50000' },
      NOW,
    );
    expect(priceFiltered.total).toBe(1);
    expect(priceFiltered.items[0].vehicle.id).toBe('vehicle-1');

    const featureFiltered = await service.searchOffers(
      { ...QUERY, features: 'gps_navigation' },
      NOW,
    );
    expect(featureFiltered.total).toBe(1);
    expect(featureFiltered.items[0].vehicle.id).toBe('vehicle-2');

    const transmissionFiltered = await service.searchOffers(
      { ...QUERY, transmission: 'AUTOMATIC' },
      NOW,
    );
    expect(transmissionFiltered.total).toBe(1);
    expect(transmissionFiltered.items[0].vehicle.id).toBe('vehicle-2');
  });

  it('paginates deterministically and echoes normalized filters', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    const pricing = basePricing();
    const rows = Array.from({ length: 3 }, (_, index) =>
      vehicleRow({ id: `vehicle-${index}`, currentBranchId: null, currentBranch: null }),
    );
    const summaries = rows.map((row, index) => ({
      id: row.id,
      categoryId: 'c',
      currentBranchId: null,
      make: 'M',
      model: `m${index}`,
      year: 2024,
      plateNumber: `p${index}`,
    }));
    pricing.computeQuotePricing.mockImplementation((input: { vehicleId: string }) => {
      const prices: Record<string, number> = { 'vehicle-0': 1000, 'vehicle-1': 3000, 'vehicle-2': 2000 };
      return Promise.resolve(pricingPayload(prices[input.vehicleId] ?? 5000));
    });
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'A', slug: 'a' }]);
    availability.listAvailableVehicles.mockResolvedValue({ start: 'x', end: 'y', vehicles: summaries, total: 3 });
    repo.listOfferVehicles.mockResolvedValue(rows);
    const service = makeService(repo, availability, pricing);

    const firstPage = await service.searchOffers({ ...QUERY, limit: '2', page: '1' }, NOW);
    expect(firstPage.total).toBe(3);
    expect(firstPage.items.map((item) => item.pricing.totalMinor)).toEqual([1000, 2000]);

    const secondPage = await service.searchOffers({ ...QUERY, limit: '2', page: '2' }, NOW);
    expect(secondPage.items.map((item) => item.pricing.totalMinor)).toEqual([3000]);
    expect(secondPage.filters.priceMinMinor).toBeNull();
  });

  it('applies radius proximity — far pickup points are excluded (07-C09)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    repo.listEnabledAgencies.mockResolvedValue([
      { id: 'tenant-1', name: 'Oran', slug: 'oran' },
      { id: 'tenant-2', name: 'Algiers', slug: 'algiers' },
    ]);
    const summaries = (branchId: string | null) => [
      { id: 'vehicle-1', categoryId: 'c', currentBranchId: branchId, make: 'M', model: 'm', year: 2024, plateNumber: 'p' },
    ];
    availability.listAvailableVehicles.mockImplementation((tenantId: string) =>
      Promise.resolve({ start: 'x', end: 'y', vehicles: summaries(tenantId === 'tenant-1' ? 'branch-1' : 'branch-2'), total: 1 }),
    );
    repo.listOfferVehicles.mockImplementation((tenantId: string) =>
      Promise.resolve([
        vehicleRow(
          tenantId === 'tenant-1'
            ? {}
            : {
                id: 'vehicle-2',
                currentBranchId: 'branch-2',
                currentBranch: branchRow({
                  id: 'branch-2',
                  location: { id: 'loc-2', city: 'Algiers', latitude: 36.75, longitude: 3.06 },
                }),
              },
        ),
      ]),
    );
    const service = makeService(repo, availability, basePricing());

    const response = await service.searchOffers({ ...QUERY, lat: '35.7', lng: '-0.63', radiusKm: '10' }, NOW);
    expect(response.total).toBe(1);
    expect(response.items[0].agency.id).toBe('tenant-1');
    expect(response.filters.radiusKm).toBe(10);
    expect(response.items[0].pickupBranch?.location.city).toBe('Oran');
  });

  it('applies viewport bbox filtering (07-C09)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    repo.listEnabledAgencies.mockResolvedValue([
      { id: 'tenant-1', name: 'Oran', slug: 'oran' },
      { id: 'tenant-2', name: 'Algiers', slug: 'algiers' },
    ]);
    availability.listAvailableVehicles.mockImplementation((tenantId: string) =>
      Promise.resolve({
        start: 'x',
        end: 'y',
        vehicles: [
          { id: 'vehicle-1', categoryId: 'c', currentBranchId: tenantId === 'tenant-1' ? 'branch-1' : 'branch-2', make: 'M', model: 'm', year: 2024, plateNumber: 'p' },
        ],
        total: 1,
      }),
    );
    repo.listOfferVehicles.mockImplementation((tenantId: string) =>
      Promise.resolve([
        vehicleRow(
          tenantId === 'tenant-1'
            ? {}
            : {
                id: 'vehicle-2',
                currentBranchId: 'branch-2',
                currentBranch: branchRow({
                  id: 'branch-2',
                  location: { id: 'loc-2', city: 'Algiers', latitude: 36.75, longitude: 3.06 },
                }),
              },
        ),
      ]),
    );
    const service = makeService(repo, availability, basePricing());

    const response = await service.searchOffers({ ...QUERY, bbox: '-5,34,1,37' }, NOW);
    expect(response.total).toBe(1);
    expect(response.items[0].agency.id).toBe('tenant-1');
    expect(response.filters.bbox).toEqual({ west: -5, south: 34, east: 1, north: 37 });
  });

  it('pins the nearest branch when a city filter coexists with coordinates (07-C09)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'A', slug: 'a' }]);
    repo.findBranchesByCity.mockResolvedValue([
      branchRow({ id: 'branch-far', name: 'Far', location: { id: 'loc-far', city: 'Oran', latitude: 35.9, longitude: -0.7 } }),
      branchRow({ id: 'branch-near', name: 'Near', location: { id: 'loc-near', city: 'Oran', latitude: 35.7, longitude: -0.63 } }),
    ]);
    availability.listAvailableVehicles.mockResolvedValue({
      start: 'x',
      end: 'y',
      vehicles: [{ id: 'vehicle-1', categoryId: 'c', currentBranchId: 'branch-near', make: 'M', model: 'm', year: 2024, plateNumber: 'p' }],
      total: 1,
    });
    repo.listOfferVehicles.mockResolvedValue([vehicleRow()]);
    const service = makeService(repo, availability, basePricing());

    const response = await service.searchOffers({ ...QUERY, pickupCity: 'Oran', lat: '35.69', lng: '-0.65' }, NOW);
    expect(response.items[0].pickupBranch?.id).toBe('branch-near');
    expect(availability.listAvailableVehicles).toHaveBeenCalledWith(
      'tenant-1',
      { start: expect.any(Date) as Date, end: expect.any(Date) as Date },
      { pickupBranchId: 'branch-near' },
      { categoryId: undefined },
    );
  });

  it('fails closed on missing branch coordinates under spatial filters (07-C09)', async () => {
    const repo = baseRepo();
    const availability = baseAvailability();
    repo.listEnabledAgencies.mockResolvedValue([{ id: 'tenant-1', name: 'A', slug: 'a' }]);
    availability.listAvailableVehicles.mockResolvedValue({
      start: 'x',
      end: 'y',
      vehicles: [{ id: 'vehicle-1', categoryId: 'c', currentBranchId: 'branch-1', make: 'M', model: 'm', year: 2024, plateNumber: 'p' }],
      total: 1,
    });
    repo.listOfferVehicles.mockResolvedValue([
      vehicleRow({
        currentBranch: branchRow({ location: { id: 'loc-1', city: null, latitude: null, longitude: null } }),
      }),
    ]);
    const service = makeService(repo, availability, basePricing());
    const response = await service.searchOffers({ ...QUERY, lat: '35.7', lng: '-0.63', radiusKm: '10' }, NOW);
    expect(response.total).toBe(0);
  });

  it('maps the public locations feed and skips rows without coordinates (07-C05)', async () => {
    const repo = baseRepo();
    repo.listBranchLocations.mockResolvedValue([
      {
        id: 'branch-1',
        name: 'Centre',
        location: { id: 'loc-1', name: 'Oran Downtown', city: 'Oran', latitude: 35.7, longitude: -0.63 },
        tenant: { id: 'tenant-1', name: 'Agence Oran', slug: 'agence-oran' },
      },
      {
        id: 'branch-2',
        name: 'NoCoords',
        location: { id: 'loc-2', name: 'Unknown', city: null, latitude: null, longitude: null },
        tenant: { id: 'tenant-1', name: 'Agence Oran', slug: 'agence-oran' },
      },
    ]);
    const service = makeService(repo, baseAvailability(), basePricing());
    const response = await service.listLocations();
    expect(response.total).toBe(1);
    expect(response.items[0]).toEqual({
      branch: { id: 'branch-1', name: 'Centre' },
      location: { id: 'loc-1', name: 'Oran Downtown', city: 'Oran', latitude: 35.7, longitude: -0.63 },
      agency: { id: 'tenant-1', name: 'Agence Oran', slug: 'agence-oran' },
    });
  });

  it('maps spatial validation failures to the stable 409 envelope (07-C09)', async () => {
    const repo = baseRepo();
    const service = makeService(repo, baseAvailability(), basePricing());
    const radiusWithoutCoords = await service
      .searchOffers({ ...QUERY, radiusKm: '10' }, NOW)
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((radiusWithoutCoords as ConflictException).getResponse()).toMatchObject({
      code: 'RADIUS_REQUIRES_COORDINATES',
    });

    const malformedBbox = await service
      .searchOffers({ ...QUERY, bbox: '1,2' }, NOW)
      .then(() => null)
      .catch((error: ConflictException) => error);
    expect((malformedBbox as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_BBOX' });
  });
});
