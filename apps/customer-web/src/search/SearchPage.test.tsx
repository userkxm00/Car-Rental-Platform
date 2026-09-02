import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchOffersResponseDto } from '@kavriqo/api-client';
import i18n from '../i18n';
import type { MapViewProps } from '../maps/MapView';
import { SearchPage } from './SearchPage';

/**
 * Marketplace search page tests (07-C07/07-C08): form → server query,
 * map/list synchronization, search-this-area and pagination — against a
 * mocked MapView (MapLibre needs WebGL, unavailable in jsdom).
 */

const mocks = vi.hoisted(() => {
  const mapState: { props: MapViewProps | null } = { props: null };
  return {
    mapState,
    locations: vi.fn(),
    offers: vi.fn(),
  };
});

vi.mock('../api', () => ({
  createApi: () => ({ locations: mocks.locations, offers: mocks.offers }),
  ApiError: class ApiError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('../maps/MapView', () => ({
  MapView: (props: MapViewProps): React.JSX.Element => {
    mocks.mapState.props = props;
    return <div data-testid="map-stub" />;
  },
}));

const NOW = new Date('2026-10-01T09:00:00');

function offerResponse(page: number, total: number): SearchOffersResponseDto {
  return {
    items: [
      {
        agency: { id: 'a1', name: 'Agence Oran', slug: 'agence-oran' },
        vehicle: {
          id: 'v1',
          make: 'Dacia',
          model: 'Logan',
          year: 2024,
          plateNumber: 'P-1',
          category: {
            id: 'c1',
            name: 'Economy',
            transmission: 'MANUAL',
            fuelType: 'DIESEL',
            seats: 5,
            features: ['air_conditioning'],
          },
        },
        pickupBranch: {
          id: 'b1',
          name: 'Centre',
          location: { id: 'l1', city: 'Oran', latitude: 35.7, longitude: -0.63 },
          distanceKm: 2.5,
        },
        pricing: {
          currency: 'DZD',
          totalMinor: 9000,
          breakdown: [{ code: 'RENTAL', amountMinor: 9000 }],
          depositMinor: 0,
          calculatedAt: NOW.toISOString(),
        },
      },
    ],
    total,
    page,
    limit: 20,
    sort: 'price_asc',
    filters: {
      start: '2026-10-02T09:00:00.000Z',
      end: '2026-10-04T09:00:00.000Z',
      pickupLocationId: null,
      pickupCity: null,
      agencyId: null,
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

const LOCATIONS = [
  {
    branch: { id: 'b1', name: 'Centre' },
    location: { id: 'l1', name: 'Oran Downtown', city: 'Oran', latitude: 35.7, longitude: -0.63 },
    agency: { id: 'a1', name: 'Agence Oran', slug: 'agence-oran' },
  },
];

function renderPage(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <SearchPage />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  mocks.locations.mockReset().mockResolvedValue({ items: LOCATIONS, total: 1 });
  mocks.offers.mockReset().mockResolvedValue(offerResponse(1, 1));
  mocks.mapState.props = null;
});

describe('SearchPage (07-C map/list)', () => {
  it('loads the locations feed as initial map pins', async () => {
    renderPage();
    await screen.findByTestId('map-stub');
    await waitFor(() => {
      expect(mocks.mapState.props?.markers).toHaveLength(1);
    });
    expect(mocks.mapState.props?.markers[0]).toMatchObject({ kind: 'location', title: 'Centre' });
  });

  it('submits the form and renders synchronized result cards and pins', async () => {
    renderPage();
    await screen.findByTestId('map-stub');

    fireEvent.change(screen.getByLabelText('Pickup location'), { target: { value: 'Oran' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(mocks.offers).toHaveBeenCalledWith(
        expect.objectContaining({ pickupCity: 'Oran', sort: 'price_asc', page: 1, limit: 20 }),
      );
    });
    await screen.findByTestId('result-card');
    expect(screen.getByText('Dacia Logan · 2024')).toBeInTheDocument();
    expect(screen.getByText(/Pickup at Centre/)).toBeInTheDocument();

    // List → map synchronization: selecting a card highlights its pin.
    await waitFor(() => {
      expect(mocks.mapState.props?.markers[0]).toMatchObject({ kind: 'offer', offerIndex: 0 });
    });
    fireEvent.click(screen.getByTestId('result-card'));
    await waitFor(() => {
      expect(mocks.mapState.props?.selectedOfferIndex).toBe(0);
    });
  });

  it('reports validation failures without calling the server', async () => {
    renderPage();
    await screen.findByTestId('map-stub');

    fireEvent.change(screen.getByLabelText('Return date'), { target: { value: '2020-01-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Return must be after pickup.')).toBeInTheDocument();
    expect(mocks.offers).not.toHaveBeenCalled();
  });

  it('supports search-this-area after the map moved (07-C08)', async () => {
    renderPage();
    await screen.findByTestId('map-stub');

    const viewport = { west: -5, south: 34, east: 1, north: 37, centerLat: 35.5, centerLng: -2 };
    act(() => {
      mocks.mapState.props?.onViewportChange(viewport);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Search this area' }));
    await waitFor(() => {
      expect(mocks.offers).toHaveBeenCalledWith(
        expect.objectContaining({ bbox: '-5,34,1,37', lat: 35.5, lng: -2 }),
      );
    });
  });

  it('toggles between map and list on mobile (07-C07)', async () => {
    renderPage();
    await screen.findByTestId('map-stub');

    const split = document.querySelector('.kv-search-split');
    expect(split?.getAttribute('data-mode')).toBe('map');
    fireEvent.click(screen.getByRole('button', { name: 'View list' }));
    expect(split?.getAttribute('data-mode')).toBe('list');
  });

  it('paginates and shows the page indicator', async () => {
    mocks.offers.mockResolvedValue(offerResponse(1, 30));
    renderPage();
    await screen.findByTestId('map-stub');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(mocks.offers).toHaveBeenCalledTimes(1);
    });
    await screen.findByText('1 / 2');

    fireEvent.click(screen.getByRole('button', { name: '→' }));
    await waitFor(() => {
      expect(mocks.offers).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
  });
});
