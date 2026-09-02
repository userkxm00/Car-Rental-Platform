import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortalBookingDto, PublicBranchDto } from '@kavriqo/api-client';
import i18n from '../i18n';
import { PORTAL_TOKEN_STORAGE_KEY } from '../api';
import { BookingDetailPage } from './BookingDetailPage';

/**
 * Reservation detail tests (07-E09/E10/E11): status history, the DRAFT
 * confirmation action, cancellation with a reason and the agency
 * support/contact surface.
 */

const mocks = vi.hoisted(() => ({
  booking: vi.fn(),
  branches: vi.fn(),
  confirmBooking: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock('../api', () => ({
  createApi: () => ({
    booking: mocks.booking,
    branches: mocks.branches,
    confirmBooking: mocks.confirmBooking,
    cancelBooking: mocks.cancelBooking,
  }),
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
    status: 'DRAFT',
    customerId: null,
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
    statusHistory: [
      {
        historyId: 'h1',
        fromStatus: null,
        toStatus: 'DRAFT',
        actorUserId: 'u1',
        reason: 'booking.created',
        correlationId: null,
        createdAt: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

function branchDto(): PublicBranchDto {
  return {
    id: 'br1',
    name: 'Oran Centre',
    code: 'ORN-C',
    timezone: null,
    contacts: { phone: '+213550000001', email: 'center@example.dz' },
    location: {
      id: 'l1',
      name: 'Centre-ville',
      addressLine1: null,
      addressLine2: null,
      city: 'Oran',
      region: null,
      postalCode: null,
      countryCode: 'DZ',
      latitude: null,
      longitude: null,
    },
    hours: { regular: [], exceptions: [] },
  };
}

function renderPage(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/bookings/b1']}>
        <Routes>
          <Route path="/bookings/:bookingId" element={<BookingDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('BookingDetailPage (07-E09/E10/E11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'test-token');
    mocks.booking.mockResolvedValue(bookingDto());
    mocks.branches.mockResolvedValue({ items: [branchDto()], total: 1 });
  });

  it('renders the reservation with its status history', async () => {
    renderPage();
    expect(await screen.findByText('BK-2026-000042')).toBeTruthy();
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getByText('booking.created')).toBeTruthy();
    expect(screen.getByText(/\+213550000001/)).toBeTruthy();
  });

  it('confirms a DRAFT reservation (07-E08)', async () => {
    mocks.confirmBooking.mockResolvedValue(bookingDto({ status: 'PENDING_CONFIRMATION' }));
    renderPage();

    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    await userEvent.click(confirm);
    await waitFor(() => {
      expect(mocks.confirmBooking).toHaveBeenCalledWith('b1', {});
    });
  });

  it('cancels with a reason and renders the new status (07-E10)', async () => {
    mocks.cancelBooking.mockResolvedValue(bookingDto({ status: 'CANCELLED' }));
    renderPage();

    const reason = await screen.findByPlaceholderText('Why are you cancelling?');
    await userEvent.type(reason, 'plans changed');
    const cancel = screen.getByRole('button', { name: 'Cancel reservation' });
    await userEvent.click(cancel);
    await waitFor(() => {
      expect(mocks.cancelBooking).toHaveBeenCalledWith('b1', 'plans changed');
    });
  });

  it('disables cancellation without a reason', async () => {
    renderPage();
    const cancel = await screen.findByRole('button', { name: 'Cancel reservation' });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not offer confirmation for non-DRAFT reservations', async () => {
    mocks.booking.mockResolvedValue(bookingDto({ status: 'CONFIRMED' }));
    renderPage();
    await screen.findByText('BK-2026-000042');
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel reservation' })).toBeTruthy();
  });
});
