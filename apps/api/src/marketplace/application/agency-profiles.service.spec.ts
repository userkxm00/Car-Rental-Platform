import { NotFoundException } from '@nestjs/common';
import type { MediaService } from '../../media/application/media.service';
import type { SearchService } from '../../search/application/search.service';
import type { SearchOffersResponse } from '../../search/domain/search-contract';
import { AgencyProfilesService } from './agency-profiles.service';
import {
  AgencyProfileRepository,
  PublicAgencyRow,
  PublicBranchRow,
  PublicVehicleRow,
} from '../infrastructure/agency-profile.repository';

describe('AgencyProfilesService', () => {
  const NOW = new Date('2026-10-01T09:00:00.000Z');

  const agencyRow: PublicAgencyRow = {
    id: 'tenant-1',
    name: 'Agence Oran',
    slug: 'agence-oran',
    legalName: 'SARL Agence Oran',
    verificationStatus: 'VERIFIED',
    createdAt: new Date('2025-01-15T00:00:00.000Z'),
    defaultCurrency: 'DZD',
    defaultLocale: 'ar',
  };

  function branchRow(overrides: Partial<PublicBranchRow> = {}): PublicBranchRow {
    return {
      id: 'branch-1',
      name: 'Oran Centre',
      code: 'ORN-C',
      timezone: 'Africa/Algiers',
      contacts: { phone: '+213550000001', email: 'center@oran.dz' },
      location: {
        id: 'loc-1',
        name: 'Centre-ville',
        addressLine1: '12 Rue Larbi Ben Mhidi',
        addressLine2: null,
        city: 'Oran',
        region: 'Oran',
        postalCode: '31000',
        countryCode: 'DZ',
        latitude: 35.7041,
        longitude: -0.6401,
        hours: [
          { dayOfWeek: 0, opensAt: '08:00', closesAt: '19:00' },
          { dayOfWeek: 5, opensAt: '09:00', closesAt: '13:00' },
        ],
        hourExceptions: [{ date: new Date('2026-11-01T00:00:00.000Z'), opensAt: null, closesAt: null }],
      },
      ...overrides,
    };
  }

  function vehicleRow(overrides: Partial<PublicVehicleRow> = {}): PublicVehicleRow {
    return {
      id: 'vehicle-1',
      make: 'Dacia',
      model: 'Logan',
      year: 2024,
      category: {
        id: 'cat-1',
        name: 'Economy',
        nameAr: 'اقتصادية',
        nameFr: 'Économique',
        description: 'Compact city car',
        descriptionAr: null,
        descriptionFr: null,
        transmission: 'MANUAL',
        fuelType: 'DIESEL',
        seats: 5,
        features: [{ featureKey: 'air_conditioning' }, { featureKey: 'bluetooth' }],
      },
      images: [
        { id: 'img-1', position: 0, isPrimary: true, contentType: 'image/jpeg' },
        { id: 'img-2', position: 1, isPrimary: false, contentType: 'image/jpeg' },
      ],
      currentBranch: branchRow(),
      ...overrides,
    };
  }

  function offerResponse(items: SearchOffersResponse['items'], total = items.length): SearchOffersResponse {
    return {
      items,
      total,
      page: 1,
      limit: 20,
      sort: 'price_asc',
      filters: {
        start: NOW.toISOString(),
        end: '2026-10-03T09:00:00.000Z',
        pickupLocationId: null,
        pickupCity: null,
        agencyId: 'tenant-1',
        vehicleId: null,
        categoryId: null,
        transmission: null,
        fuelType: null,
        seats: null,
        features: [],
        priceMinMinor: null,
        priceMaxMinor: null,
        lat: null,
        lng: null,
        radiusKm: null,
        bbox: null,
      },
    };
  }

  function buildService() {
    const repository = {
      findPublicAgency: jest.fn(),
      listPublicBranches: jest.fn(),
      countFleet: jest.fn(),
      listActiveDepositPolicies: jest.fn(),
      findPublicVehicle: jest.fn(),
      findPublicVehicleImage: jest.fn(),
    };
    const search = { searchOffers: jest.fn() };
    const media = { signedImageUrl: jest.fn() };
    const service = new AgencyProfilesService(
      repository as unknown as AgencyProfileRepository,
      search as unknown as SearchService,
      media as unknown as MediaService,
    );
    return { service, repository, search, media };
  }

  describe('getProfile', () => {
    it('404s with AGENCY_NOT_FOUND for unknown or non-participating slugs', async () => {
      const { service, repository } = buildService();
      repository.findPublicAgency.mockResolvedValue(null);
      const failure = await service.getProfile('missing').catch((error: unknown) => error);
      expect((failure as NotFoundException).getResponse()).toMatchObject({ code: 'AGENCY_NOT_FOUND' });
    });

    it('composes identity, service areas, stats, NEW rating and policies', async () => {
      const { service, repository } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.listPublicBranches.mockResolvedValue([
        branchRow(),
        branchRow({
          id: 'branch-2',
          code: 'ORN-A',
          location: { ...branchRow().location, city: 'Algiers', id: 'loc-2' },
        }),
        branchRow({
          id: 'branch-3',
          code: 'ORN-B',
          location: { ...branchRow().location, city: 'Oran', id: 'loc-3' },
        }),
      ]);
      repository.countFleet.mockResolvedValue(12);
      repository.listActiveDepositPolicies.mockResolvedValue([
        { name: 'Standard', depositType: 'FIXED_MINOR', valueMinor: 20000 },
      ]);

      const profile = await service.getProfile('agence-oran');

      expect(profile.agency).toEqual({
        id: 'tenant-1',
        name: 'Agence Oran',
        slug: 'agence-oran',
        legalName: 'SARL Agence Oran',
        verificationStatus: 'VERIFIED',
        establishedAt: '2025-01-15T00:00:00.000Z',
        defaultCurrency: 'DZD',
        defaultLocale: 'ar',
      });
      expect(profile.serviceAreas).toEqual(['Algiers', 'Oran']);
      expect(profile.stats).toEqual({ branchCount: 3, fleetCount: 12 });
      expect(profile.ratingSummary).toEqual({ state: 'NEW', averageRating: null, reviewCount: 0 });
      expect(profile.depositPolicies).toEqual([
        { name: 'Standard', depositType: 'FIXED_MINOR', valueMinor: 20000 },
      ]);
    });
  });

  describe('listBranches', () => {
    it('maps branches to the public contract with sorted hours', async () => {
      const { service, repository } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.listPublicBranches.mockResolvedValue([branchRow()]);

      const response = await service.listBranches('agence-oran');

      expect(response.total).toBe(1);
      expect(response.items[0]).toMatchObject({
        id: 'branch-1',
        name: 'Oran Centre',
        code: 'ORN-C',
        timezone: 'Africa/Algiers',
        contacts: { phone: '+213550000001', email: 'center@oran.dz' },
        location: { id: 'loc-1', city: 'Oran', latitude: 35.7041 },
      });
      expect(response.items[0].hours.regular).toEqual([
        { dayOfWeek: 0, opensAt: '08:00', closesAt: '19:00' },
        { dayOfWeek: 5, opensAt: '09:00', closesAt: '13:00' },
      ]);
      expect(response.items[0].hours.exceptions).toEqual([
        { date: '2026-11-01', opensAt: null, closesAt: null },
      ]);
    });

    it('404s for unknown slugs', async () => {
      const { service, repository } = buildService();
      repository.findPublicAgency.mockResolvedValue(null);
      await expect(service.listBranches('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('searchFleet', () => {
    it('forces the tenant scope over any client agencyId', async () => {
      const { service, repository, search } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      search.searchOffers.mockResolvedValue(offerResponse([]));

      await service.searchFleet('agence-oran', { agencyId: 'other-tenant', limit: 5 }, NOW);

      expect(search.searchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: 'tenant-1', limit: 5 }),
        NOW,
      );
    });
  });

  describe('getVehicle', () => {
    it('404s for unknown agency and unknown vehicle', async () => {
      const { service, repository } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.findPublicVehicle.mockResolvedValue(null);
      const vehicleFailure = await service.getVehicle('agence-oran', 'nope', {}, NOW).catch((error: unknown) => error);
      expect((vehicleFailure as NotFoundException).getResponse()).toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
      repository.findPublicAgency.mockResolvedValue(null);
      const agencyFailure = await service.getVehicle('missing', 'nope', {}, NOW).catch((error: unknown) => error);
      expect((agencyFailure as NotFoundException).getResponse()).toMatchObject({ code: 'AGENCY_NOT_FOUND' });
    });

    it('returns the vehicle detail with the pipeline offer attached', async () => {
      const { service, repository, search } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.findPublicVehicle.mockResolvedValue(vehicleRow());
      const offer = {
        agency: { id: 'tenant-1', name: 'Agence Oran', slug: 'agence-oran' },
        vehicle: {
          id: 'vehicle-1',
          make: 'Dacia',
          model: 'Logan',
          year: 2024,
          plateNumber: 'P-1',
          category: {
            id: 'cat-1',
            name: 'Economy',
            transmission: 'MANUAL',
            fuelType: 'DIESEL',
            seats: 5,
            features: ['air_conditioning'],
          },
        },
        pickupBranch: {
          id: 'branch-1',
          name: 'Oran Centre',
          location: { id: 'loc-1', city: 'Oran', latitude: 35.7041, longitude: -0.6401 },
          distanceKm: 2.4,
        },
        pricing: {
          currency: 'DZD',
          totalMinor: 9000,
          breakdown: [{ code: 'RENTAL', amountMinor: 9000 }],
          depositMinor: 20000,
          calculatedAt: NOW.toISOString(),
        },
      };
      search.searchOffers.mockResolvedValue(offerResponse([offer]));

      const detail = await service.getVehicle('agence-oran', 'vehicle-1', { start: 'x', end: 'y' }, NOW);

      expect(search.searchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: 'tenant-1', vehicleId: 'vehicle-1' }),
        NOW,
      );
      expect(detail.vehicle).toMatchObject({
        id: 'vehicle-1',
        make: 'Dacia',
        model: 'Logan',
        year: 2024,
        category: { id: 'cat-1', name: 'Economy', nameAr: 'اقتصادية', features: ['air_conditioning', 'bluetooth'] },
        gallery: [
          { id: 'img-1', position: 0, isPrimary: true, contentType: 'image/jpeg' },
          { id: 'img-2', position: 1, isPrimary: false, contentType: 'image/jpeg' },
        ],
      });
      expect(detail.vehicle.pickupBranch?.id).toBe('branch-1');
      expect(detail.offer?.pricing.totalMinor).toBe(9000);
      expect(detail.offer?.pickupBranch?.distanceKm).toBe(2.4);
    });

    it('returns offer null when the pipeline finds no bookable offer', async () => {
      const { service, repository, search } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.findPublicVehicle.mockResolvedValue(vehicleRow());
      search.searchOffers.mockResolvedValue(offerResponse([]));

      const detail = await service.getVehicle('agence-oran', 'vehicle-1', {}, NOW);

      expect(detail.offer).toBeNull();
      expect(detail.vehicle.id).toBe('vehicle-1');
    });
  });

  describe('getVehicleImageUrl', () => {
    it('404s when the image is not owned by the vehicle/agency', async () => {
      const { service, repository } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.findPublicVehicleImage.mockResolvedValue(null);
      const failure = await service
        .getVehicleImageUrl('agence-oran', 'vehicle-1', 'img-x')
        .catch((error: unknown) => error);
      expect((failure as NotFoundException).getResponse()).toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    });

    it('returns the signed URL for owned images', async () => {
      const { service, repository, media } = buildService();
      repository.findPublicAgency.mockResolvedValue(agencyRow);
      repository.findPublicVehicleImage.mockResolvedValue({ id: 'img-1', vehicleId: 'vehicle-1' });
      media.signedImageUrl.mockResolvedValue({
        url: 'https://storage.example/private/img',
        expiresAt: new Date('2026-10-01T09:15:00.000Z'),
      });

      const result = await service.getVehicleImageUrl('agence-oran', 'vehicle-1', 'img-1');

      expect(media.signedImageUrl).toHaveBeenCalledWith('tenant-1', 'vehicle-1', 'img-1');
      expect(result).toEqual({ url: 'https://storage.example/private/img', expiresAt: '2026-10-01T09:15:00.000Z' });
    });
  });
});
