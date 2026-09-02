import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgencyProfileDto, PortalBookingDto, PortalQuoteDto } from '@kavriqo/api-client';
import i18n from '../i18n';
import { PORTAL_TOKEN_STORAGE_KEY } from '../api';
import { BookingWizardPage } from './BookingWizardPage';

/**
 * Booking wizard tests (07-E03..E08): quote review + refresh, customer
 * record display, agency policies, the payment-method stub and the
 * reserve flow (booking + confirmation), with the api mocked.
 */

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  createQuote: vi.fn(),
  ensureCustomer: vi.fn(),
  createBooking: vi.fn(),
  confirmBooking: vi.fn(),
}));

vi.mock('../api', () => ({
  createApi: () => ({
    profile: mocks.profile,
    createQuote: mocks.createQuote,
    ensureCustomer: mocks.ensureCustomer,
    createBooking: mocks.createBooking,
    confirmBooking: mocks.confirmBooking,
  }),
  PORTAL_TOKEN_STORAGE_KEY: 'kavriqo.portalToken',
  ApiError: class ApiError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = 'ApiError';
    }
  },
}));

function profileDto(): AgencyProfileDto {
  return {
    agency: {
      id: 'a1',
      name: 'Agence Oran',
      slug: 'agence-oran',
      legalName: null,
      verificationStatus: 'VERIFIED',
      establishedAt: '2025-01-15T00:00:00.000Z',
      defaultCurrency: 'DZD',
      defaultLocale: 'ar',
    },
    serviceAreas: ['Oran'],
    stats: { branchCount: 1, fleetCount: 4 },
    ratingSummary: { state: 'NEW', averageRating: null, reviewCount: 0 },
    depositPolicies: [{ name: 'Standard', depositType: 'FIXED_MINOR', valueMinor: 20000 }],
  };
}

function quoteDto(overrides: Partial<PortalQuoteDto> = {}): PortalQuoteDto {
  return {
    quoteId: 'q1',
    tenantId: 'a1',
    channel: 'MARKETPLACE',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    expired: false,
    request: {
      start: '2026-11-02T09:00:00.000Z',
      end: '2026-11-04T09:00:00.000Z',
      mode: 'VEHICLE',
      vehicleId: 'v1',
      categoryId: null,
      pickupBranchId: null,
      returnBranchId: null,
      deliveryZoneId: null,
    },
    availability: { available: true },
    pricing: {
      currency: 'DZD',
      totalMinor: 9600,
      breakdown: [{ code: 'BASE_RATE', amountMinor: 9600 }],
      depositMinor: 20000,
    },
    ...overrides,
  };
}

function bookingDto(): PortalBookingDto {
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
  };
}

function renderPage(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={[
          '/book/agence-oran?vehicleId=v1&start=2026-11-02T09:00:00.000Z&end=2026-11-04T09:00:00.000Z',
        ]}
      >
        <Routes>
          <Route path="/book/:slug" element={<BookingWizardPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('BookingWizardPage (07-E03…E08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(PORTAL_TOKEN_STORAGE_KEY, 'test-token');
    mocks.profile.mockResolvedValue(profileDto());
    mocks.createQuote.mockResolvedValue(quoteDto());
    mocks.ensureCustomer.mockResolvedValue({
      id: 'c1',
      tenantId: 'a1',
      userId: 'u1',
      firstName: 'Karim',
      lastName: 'Haddad',
      phone: null,
      email: null,
      preferredLocale: 'ar',
      status: 'ACTIVE',
    });
  });

  it('reviews the quote with server pricing and the deposit (07-E04)', async () => {
    renderPage();
    expect(await screen.findByText('Quote review')).toBeTruthy();
    expect(screen.getByText(/96/)).toBeTruthy();
    expect(screen.getByText(/Deposit: 200 DZD/)).toBeTruthy();
    expect(screen.getByText('Reserving as Karim Haddad')).toBeTruthy();
  });

  it('presents agency deposit policies (07-E06)', async () => {
    renderPage();
    expect(await screen.findByText(/Standard: 200 DZD/)).toBeTruthy();
  });

  it('shows the pay-at-agency stub (07-E07)', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Payment method' })).toBeTruthy();
    expect(screen.getByText('Pay at the agency')).toBeTruthy();
  });

  it('creates and confirms the reservation (07-E08)', async () => {
    mocks.createBooking.mockResolvedValue(bookingDto());
    mocks.confirmBooking.mockResolvedValue(bookingDto());
    renderPage();

    const reserve = await screen.findByRole('button', { name: 'Reserve' });
    await userEvent.click(reserve);

    await waitFor(() => {
      expect(mocks.createBooking).toHaveBeenCalledWith({ quoteId: 'q1' });
    });
    await waitFor(() => {
      expect(mocks.confirmBooking).toHaveBeenCalledWith('b1', {});
    });
    expect(await screen.findByText('Reservation confirmed! The agency has received your request.')).toBeTruthy();
    expect(screen.getByText('View reservation')).toBeTruthy();
  });

  it('disables reserving an expired quote (07-E04)', async () => {
    mocks.createQuote.mockResolvedValue(quoteDto({ expired: true }));
    renderPage();
    expect(await screen.findByText(/This quote has expired/)).toBeTruthy();
    const reserve = screen.getByRole('button', { name: 'Reserve' });
    expect((reserve as HTMLButtonElement).disabled).toBe(true);
  });

  it('refreshes the quote on demand (07-E03)', async () => {
    renderPage();
    const refresh = await screen.findByRole('button', { name: 'Refresh availability' });
    await userEvent.click(refresh);
    await waitFor(() => {
      expect(mocks.createQuote).toHaveBeenCalledTimes(2);
    });
  });
});
