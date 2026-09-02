import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleDetailResponseDto } from '@kavriqo/api-client';
import i18n from '../i18n';
import type { MapViewProps } from '../maps/MapView';
import { VehicleDetailPage } from './VehicleDetailPage';

/**
 * Vehicle offer detail tests (07-D09/D10): specs/gallery/pricing
 * rendering, the honest not-bookable state, and the pickup map stub
 * (MapLibre needs WebGL, unavailable in jsdom).
 */

const mocks = vi.hoisted(() => ({
  vehicle: vi.fn(),
  vehicleImageUrl: vi.fn(),
}));

vi.mock('../api', () => ({
  createApi: () => ({ vehicle: mocks.vehicle, vehicleImageUrl: mocks.vehicleImageUrl }),
  ApiError: class ApiError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('../maps/MapView', () => ({
  MapView: (props: MapViewProps): React.JSX.Element => <div data-testid="map-stub" data-markers={props.markers.length} />,
}));

const NOW = '2026-10-01T09:00:00.000Z';

function detailDto(offerPresent = true): VehicleDetailResponseDto {
  return {
    vehicle: {
      id: 'v1',
      make: 'Dacia',
      model: 'Logan',
      year: 2024,
      category: {
        id: 'c1',
        name: 'Economy',
        nameAr: 'اقتصادية',
        nameFr: null,
        description: null,
        descriptionAr: null,
        descriptionFr: null,
        transmission: 'MANUAL',
        fuelType: 'DIESEL',
        seats: 5,
        features: ['air_conditioning', 'bluetooth'],
      },
      gallery: [
        { id: 'img-1', position: 0, isPrimary: true, contentType: 'image/jpeg' },
        { id: 'img-2', position: 1, isPrimary: false, contentType: 'image/jpeg' },
      ],
      pickupBranch: {
        id: 'b1',
        name: 'Oran Centre',
        code: 'ORN-C',
        timezone: 'Africa/Algiers',
        contacts: { phone: '+213550000001' },
        location: {
          id: 'l1',
          name: 'Centre-ville',
          addressLine1: '12 Rue Larbi Ben Mhidi',
          addressLine2: null,
          city: 'Oran',
          region: 'Oran',
          postalCode: '31000',
          countryCode: 'DZ',
          latitude: 35.7041,
          longitude: -0.6401,
        },
        hours: {
          regular: [{ dayOfWeek: 0, opensAt: '08:00', closesAt: '19:00' }],
          exceptions: [],
        },
      },
    },
    offer: offerPresent
      ? {
          pickupBranch: {
            id: 'b1',
            name: 'Oran Centre',
            location: { id: 'l1', city: 'Oran', latitude: 35.7041, longitude: -0.6401 },
            distanceKm: null,
          },
          pricing: {
            currency: 'DZD',
            totalMinor: 9000,
            breakdown: [{ code: 'RENTAL', amountMinor: 9000 }],
            depositMinor: 20000,
            calculatedAt: NOW,
          },
        }
      : null,
  };
}

function renderPage(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/agence-oran/vehicles/v1?start=2026-11-02T09:00:00.000Z&end=2026-11-04T09:00:00.000Z']}>
        <Routes>
          <Route path="/:slug/vehicles/:vehicleId" element={<VehicleDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('VehicleDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders specs, gallery, pricing and the pickup map', async () => {
    mocks.vehicle.mockResolvedValue(detailDto());
    mocks.vehicleImageUrl.mockResolvedValue({ url: 'https://cdn.test/img-1', expiresAt: NOW });
    renderPage();

    expect(await screen.findByText('Dacia Logan · 2024')).toBeTruthy();
    // Total appears in the header and in the pricing block.
    expect(screen.getAllByText('90 DZD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Air conditioning')).toBeTruthy();
    expect(screen.getByText('Bluetooth')).toBeTruthy();
    expect(screen.getByText(/Deposit: 200 DZD/)).toBeTruthy();
    expect(screen.getByTestId('map-stub')).toBeTruthy();
    expect(screen.getByText('Book this car')).toBeTruthy();
    await waitFor(() => {
      expect(mocks.vehicleImageUrl).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the not-bookable state when no offer exists (07-D09)', async () => {
    mocks.vehicle.mockResolvedValue(detailDto(false));
    renderPage();

    expect(
      await screen.findByText('This car is not bookable for the selected dates. Try other dates.'),
    ).toBeTruthy();
    expect(screen.queryByText(/90 DZD/)).toBeNull();
  });

  it('shows the not-found state for unknown vehicles', async () => {
    mocks.vehicle.mockRejectedValue(Object.assign(new Error('gone'), { code: 'VEHICLE_NOT_FOUND' }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('This vehicle is not available.')).toBeTruthy();
    });
  });
});
