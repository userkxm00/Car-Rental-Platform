import {
  ApiClient,
  createAgencyProfilesApi,
  createMePortalApi,
  createSearchApi,
} from '@kavriqo/api-client';

/**
 * Marketplace + customer portal API wiring.
 *
 * The marketplace surface (search, locations, agency profiles) is public.
 * The booking portal (07-E, /me endpoints) needs the caller's access
 * token: it is read from localStorage (set through the token sign-in
 * helper on the portal pages) and passed as the client's token provider
 * — the client never stores credentials itself. Base URL comes from the
 * Vite environment (VITE_API_URL); the dev server proxies /api/v1 to the
 * local API.
 */

export const PORTAL_TOKEN_STORAGE_KEY = 'kavriqo.portalToken';

export function createApi(): MarketplaceApi & PortalApi {
  const client = new ApiClient({
    baseUrl: String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000'),
    tokenProvider: () => Promise.resolve(localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY)),
  });
  return {
    ...createSearchApi(client),
    ...createAgencyProfilesApi(client),
    ...createMePortalApi(client),
  };
}

export type MarketplaceApi = ReturnType<typeof createSearchApi> & ReturnType<typeof createAgencyProfilesApi>;
export type PortalApi = ReturnType<typeof createMePortalApi>;

export type {
  AgencyProfileDto,
  PortalBookingDto,
  PortalCustomerDto,
  PortalQuoteDto,
  PublicBranchDto,
  PublicVehicleDetailDto,
  SearchOfferDto,
  SearchOffersQueryInput,
  VehicleDetailResponseDto,
} from '@kavriqo/api-client';
export { ApiError } from '@kavriqo/api-client';
