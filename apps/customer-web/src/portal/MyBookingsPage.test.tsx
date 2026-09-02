import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortalBookingDto } from '@kavriqo/api-client';
import i18n from '../i18n';
import { PORTAL_TOKEN_STORAGE_KEY } from '../api';
import { MyBookingsPage } from './MyBookingsPage';

/**
 * My reservations list tests (07-E09): bookings render with their
 * agency, dates and lifecycle status.
 */

const mocks = vi.hoisted(() => ({
  listBookings: vi.fn(),
}));

vi.mock('../api', () => ({
  createApi: () => ({ listBookings: mocks.listBookings }),
  PORTAL_TOKEN_STORAGE_KEY: 'kavriqo.portalToken',
  ApiError: class ApiError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = 'ApiError';
    }
  },
}));

function bookingDto(overrides: Partial<PortalBookingDto> = {}): PortalBookingDto {
  return {
    bookingId: 'b1',
    tenantId: 'a1',
    agencySlug: 'agence-oran',
    bookingNumber: 'BK-2026-000042',
    channel: 'MARKETPLACE',
    inventoryMode: 'VEHICLE',
    status: 'PENDING_CONFIRMATION',
    customerId: 'c1',
    createdBy: 'u1',
    quoteId: 'q1',
    requestedCategoryId: null,
    assignedVehicleId: 'v1',
    pickupBranchId: null,
    returnBranchId: null,
    deliveryZoneId: null,
    start: '2026-11-02T09:00:00.000Z',
    end: '2026-11-04T09:00:00.000Z',
    currency: 'DZD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    statusHistory: [],
    ...overrides,
  };
}

function renderPage(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <MyBookingsPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('MyBookingsPage (07-E09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'test-token');
  });

  it('lists the caller’s reservations with statuses', async () => {
    mocks.listBookings.mockResolvedValue([
      bookingDto(),
      bookingDto({ bookingId: 'b2', bookingNumber: 'BK-2026-000043', status: 'CANCELLED' }),
    ]);
    renderPage();

    expect(await screen.findByText('BK-2026-000042')).toBeTruthy();
    expect(screen.getByText('BK-2026-000043')).toBeTruthy();
    expect(screen.getByText('Pending confirmation')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getAllByText('agence-oran')).toHaveLength(2);
  });

  it('shows the empty state', async () => {
    mocks.listBookings.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No reservations yet/)).toBeTruthy();
  });
});
