import { NotFoundException } from '@nestjs/common';
import { MePortalService } from './me-portal.service';
import type { AgencyProfilesService } from '../../marketplace/application/agency-profiles.service';
import type { QuotesService } from '../../quotes/application/quotes.service';
import type { QuoteResponse } from '../../quotes/domain/quote-contract';
import type { BookingsService } from '../../bookings/application/bookings.service';
import type { BookingResponse } from '../../bookings/application/bookings.service';
import type { CustomerSelfService } from '../../customers/application/customer-self.service';
import type { DocumentsService } from '../../documents/application/documents.service';
import type { ContractsService } from '../../contracts/application/contracts.service';
import type { PaymentsService } from '../../payments/application/payments.service';

const profileResponse = () => ({
  agency: {
    id: 'agency-1',
    name: 'Oran Auto',
    slug: 'oran-auto',
    legalName: null,
    verificationStatus: 'VERIFIED',
    establishedAt: '2024-01-01T00:00:00.000Z',
    defaultCurrency: 'DZD',
    defaultLocale: 'ar',
  },
});

const quoteResponse = (overrides: Partial<QuoteResponse> = {}): QuoteResponse => ({
  quoteId: 'q1',
  tenantId: 'agency-1',
  channel: 'MARKETPLACE',
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  expired: false,
  request: {
    start: new Date(Date.now() + 24 * 3600_000).toISOString(),
    end: new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString(),
    mode: 'VEHICLE',
    vehicleId: '11111111-1111-4111-8111-111111111111',
    categoryId: null,
    pickupBranchId: null,
    returnBranchId: null,
    deliveryZoneId: null,
  },
  availability: {
    start: new Date(Date.now() + 24 * 3600_000).toISOString(),
    end: new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString(),
    available: true,
    conflicts: [],
  } as never,
  pricing: null,
  ...overrides,
});

const bookingResponse = (overrides: Partial<BookingResponse> = {}): BookingResponse => ({
  bookingId: 'b1',
  tenantId: 'agency-1',
  agencySlug: 'oran-auto',
  bookingNumber: 'BK-2026-000001',
  channel: 'MARKETPLACE',
  inventoryMode: 'VEHICLE',
  status: 'DRAFT',
  customerId: null,
  createdBy: 'u1',
  quoteId: 'q1',
  requestedCategoryId: null,
  assignedVehicleId: null,
  pickupBranchId: null,
  returnBranchId: null,
  deliveryZoneId: null,
  start: new Date(Date.now() + 24 * 3600_000).toISOString(),
  end: new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString(),
  currency: 'DZD',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  statusHistory: [],
  ...overrides,
});

type FakeCall = jest.Mock;

function makeService(options: {
  profileGet?: FakeCall;
  quotesCreate?: FakeCall;
  quotesList?: FakeCall;
  quoteGet?: FakeCall;
  bookingsCreate?: FakeCall;
  bookingsConfirm?: FakeCall;
  bookingsList?: FakeCall;
  bookingGet?: FakeCall;
  bookingsCancel?: FakeCall;
  customersEnsure?: FakeCall;
} = {}) {
  const profileGet = options.profileGet ?? jest.fn().mockResolvedValue(profileResponse());
  const quotesCreate = options.quotesCreate ?? jest.fn().mockResolvedValue(quoteResponse());
  const quotesList = options.quotesList ?? jest.fn().mockResolvedValue([quoteResponse()]);
  const quoteGet = options.quoteGet ?? jest.fn().mockResolvedValue(quoteResponse());
  const bookingsCreate = options.bookingsCreate ?? jest.fn().mockResolvedValue(bookingResponse());
  const bookingsConfirm =
    options.bookingsConfirm ??
    jest.fn().mockResolvedValue(bookingResponse({ status: 'PENDING_CONFIRMATION' }));
  const bookingsList = options.bookingsList ?? jest.fn().mockResolvedValue([bookingResponse()]);
  const bookingGet = options.bookingGet ?? jest.fn().mockResolvedValue(bookingResponse());
  const bookingsCancel =
    options.bookingsCancel ?? jest.fn().mockResolvedValue(bookingResponse({ status: 'CANCELLED' }));
  const customersEnsure =
    options.customersEnsure ?? jest.fn().mockResolvedValue({ id: 'c1', tenantId: 'agency-1' });

  const profiles = { getProfile: profileGet } as unknown as AgencyProfilesService;
  const quotes = {
    createQuote: quotesCreate,
    listQuotesByCreator: quotesList,
    getQuoteByCreator: quoteGet,
  } as unknown as QuotesService;
  const bookings = {
    createBooking: bookingsCreate,
    requestConfirmation: bookingsConfirm,
    listBookingsForUser: bookingsList,
    getBookingForUser: bookingGet,
    cancelBookingForUser: bookingsCancel,
  } as unknown as BookingsService;
  const customers = { ensureCustomerForAgency: customersEnsure } as unknown as CustomerSelfService;

  const documentsChecklist = jest.fn().mockResolvedValue({
    bookingId: 'b1',
    customerLinked: true,
    required: [],
    items: [],
    complete: true,
  });
  const documents = {
    checklistForBooking: documentsChecklist,
  } as unknown as DocumentsService;
  const contracts = {} as ContractsService;
  const payments = {} as PaymentsService;
  const service = new MePortalService(profiles, quotes, bookings, customers, documents, contracts, payments);
  return {
    service,
    documents,
    mocks: {
      profileGet,
      checklistForBooking: documentsChecklist,
      quotesCreate,
      quotesList,
      quoteGet,
      bookingsCreate,
      bookingsConfirm,
      bookingsList,
      bookingGet,
      bookingsCancel,
      customersEnsure,
    },
  };
}

describe('MePortalService (07-E customer booking portal)', () => {
  it('creates a quote for the resolved agency with a forced MARKETPLACE channel (07-E04)', async () => {
    const { service, mocks } = makeService();
    const input = {
      vehicleId: '11111111-1111-4111-8111-111111111111',
      start: new Date(Date.now() + 24 * 3600_000).toISOString(),
      end: new Date(Date.now() + 24 * 3600_000 + 3 * 3600_000).toISOString(),
      channel: 'AGENCY_WEB',
    };
    await service.createQuote('u1', 'oran-auto', input);
    expect(mocks.profileGet).toHaveBeenCalledWith('oran-auto');
    expect(mocks.quotesCreate).toHaveBeenCalledWith(
      'agency-1',
      'u1',
      expect.objectContaining({ channel: 'MARKETPLACE' }),
    );
  });

  it('lists and reads only the caller’s own quotes (07-E04)', async () => {
    const { service, mocks } = makeService();
    await expect(service.listQuotes('u1')).resolves.toHaveLength(1);
    await expect(service.getQuote('u1', 'q1')).resolves.toMatchObject({ quoteId: 'q1' });
    expect(mocks.quotesList).toHaveBeenCalledWith('u1');
    expect(mocks.quoteGet).toHaveBeenCalledWith('u1', 'q1');
  });

  it('resolves-or-creates the customer record through the agency slug (07-E05)', async () => {
    const { service, mocks } = makeService();
    await expect(service.ensureCustomer('u1', 'oran-auto')).resolves.toMatchObject({ id: 'c1' });
    expect(mocks.customersEnsure).toHaveBeenCalledWith('u1', 'agency-1');
  });

  it('turns an own unexpired quote into a DRAFT booking with the server-derived tenant (07-E08)', async () => {
    const source = quoteResponse();
    const { service, mocks } = makeService({ quoteGet: jest.fn().mockResolvedValue(source) });
    const result = await service.createBookingFromQuote('u1', { quoteId: 'q1', idempotencyKey: 'k1' });
    expect(result.bookingId).toBe('b1');
    expect(mocks.bookingsCreate).toHaveBeenCalledWith(
      'agency-1',
      'u1',
      expect.objectContaining({
        channel: 'MARKETPLACE',
        vehicleId: '11111111-1111-4111-8111-111111111111',
        start: source.request.start,
        end: source.request.end,
      }),
      'k1',
    );
  });

  it('refuses to book an expired quote (07-E08)', async () => {
    const { service, mocks } = makeService({
      quoteGet: jest.fn().mockResolvedValue(quoteResponse({ expired: true })),
    });
    await expect(service.createBookingFromQuote('u1', { quoteId: 'q1' })).rejects.toMatchObject({
      response: { code: 'QUOTE_EXPIRED' },
    });
    expect(mocks.bookingsCreate).not.toHaveBeenCalled();
  });

  it('never books from another caller’s quote (07-E08)', async () => {
    const { service, mocks } = makeService({
      quoteGet: jest.fn().mockRejectedValue(
        new NotFoundException({ code: 'QUOTE_NOT_FOUND', message: 'Quote not found.' }),
      ),
    });
    await expect(service.createBookingFromQuote('u2', { quoteId: 'q1' })).rejects.toMatchObject({
      response: { code: 'QUOTE_NOT_FOUND' },
    });
    expect(mocks.quoteGet).toHaveBeenCalledWith('u2', 'q1');
    expect(mocks.bookingsCreate).not.toHaveBeenCalled();
  });

  it('requests confirmation for an own booking with the server-derived tenant (07-E08)', async () => {
    const { service, mocks } = makeService();
    const body = { customerId: 'c1', quoteId: 'q1' };
    const result = await service.confirmBooking('u1', 'b1', body);
    expect(result.status).toBe('PENDING_CONFIRMATION');
    expect(mocks.bookingsConfirm).toHaveBeenCalledWith('agency-1', 'u1', 'b1', body);
  });

  it('lists, reads and cancels own bookings (07-E09/07-E10)', async () => {
    const { service, mocks } = makeService();
    await expect(service.listBookings('u1')).resolves.toHaveLength(1);
    await expect(service.getBooking('u1', 'b1')).resolves.toMatchObject({ bookingId: 'b1' });
    await expect(service.cancelBooking('u1', 'b1', 'changed my mind')).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    expect(mocks.bookingsCancel).toHaveBeenCalledWith('u1', 'b1', 'changed my mind');
  });

  it('returns the document checklist for an own booking with the server-derived tenant (08-A04)', async () => {
    const { service, mocks } = makeService({
      bookingGet: jest.fn().mockResolvedValue(bookingResponse()),
    });
    await expect(service.bookingChecklist('u1', 'b1')).resolves.toMatchObject({
      bookingId: 'b1',
      complete: true,
    });
    expect(mocks.bookingGet).toHaveBeenCalledWith('u1', 'b1');
    expect(mocks.checklistForBooking).toHaveBeenCalledWith('agency-1', 'b1');
  });
});
