import { ApiClient } from '../client';

/**
 * Typed customer booking portal endpoints (PHASE-07 07-E, the
 * authenticated me-surface). Mirrors
 * apps/api/src/portal/presentation/me-portal.controller.ts.
 *
 * All agency references travel as public slugs; identity always comes
 * from the caller's token.
 */

export interface PortalQuoteDto {
  quoteId: string;
  tenantId: string;
  channel: 'AGENCY_WEB' | 'WALK_IN' | 'MARKETPLACE';
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  request: {
    start: string;
    end: string;
    mode: 'VEHICLE' | 'CATEGORY';
    vehicleId: string | null;
    categoryId: string | null;
    pickupBranchId: string | null;
    returnBranchId: string | null;
    deliveryZoneId: string | null;
  };
  availability: { available: boolean };
  pricing: {
    currency: string;
    totalMinor: number;
    breakdown: Array<{ code: string; amountMinor: number }>;
    depositMinor: number | null;
  } | null;
}

export interface PortalBookingDto {
  bookingId: string;
  tenantId: string;
  agencySlug: string | null;
  bookingNumber: string;
  channel: 'AGENCY_WEB' | 'WALK_IN' | 'MARKETPLACE';
  inventoryMode: 'VEHICLE' | 'CATEGORY';
  status: string;
  customerId: string | null;
  createdBy: string | null;
  quoteId: string | null;
  requestedCategoryId: string | null;
  assignedVehicleId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  deliveryZoneId: string | null;
  start: string;
  end: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  statusHistory: Array<{
    historyId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: string | null;
    reason: string | null;
    correlationId: string | null;
    createdAt: string;
  }>;
}

export interface PortalCustomerDto {
  id: string;
  tenantId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  preferredLocale: string;
  status: string;
}

export function createMePortalApi(client: ApiClient) {
  return {
    createQuote(
      agencySlug: string,
      input: { vehicleId?: string; categoryId?: string; start: string; end: string },
    ): Promise<PortalQuoteDto> {
      return client.post('/me/quotes', { body: { agencySlug, ...input } });
    },
    listQuotes(): Promise<PortalQuoteDto[]> {
      return client.get('/me/quotes');
    },
    quote(quoteId: string): Promise<PortalQuoteDto> {
      return client.get(`/me/quotes/${encodeURIComponent(quoteId)}`);
    },
    ensureCustomer(agencySlug: string): Promise<PortalCustomerDto> {
      return client.post('/me/customers/ensure', { body: { agencySlug } });
    },
    createBooking(input: { quoteId: string; idempotencyKey?: string }): Promise<PortalBookingDto> {
      return client.post('/me/bookings', { body: input });
    },
    listBookings(): Promise<PortalBookingDto[]> {
      return client.get('/me/bookings');
    },
    booking(bookingId: string): Promise<PortalBookingDto> {
      return client.get(`/me/bookings/${encodeURIComponent(bookingId)}`);
    },
    confirmBooking(bookingId: string, input: { customerId?: string; quoteId?: string }): Promise<PortalBookingDto> {
      return client.post(`/me/bookings/${encodeURIComponent(bookingId)}/confirm`, { body: input });
    },
    cancelBooking(bookingId: string, reason: string): Promise<PortalBookingDto> {
      return client.post(`/me/bookings/${encodeURIComponent(bookingId)}/cancel`, { body: { reason } });
    },
  };
}

export type MePortalApi = ReturnType<typeof createMePortalApi>;
