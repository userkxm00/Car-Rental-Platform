import { ApiClient, createAgencyProfilesApi, createSearchApi } from '@kavriqo/api-client';

/**
 * Public marketplace API wiring (no token — the marketplace surface is
 * public: search, locations, agency profiles). Base URL comes from the
 * Vite environment (VITE_API_URL), defaulting to the local API, which the
 * Vite dev server proxies at /api/v1.
 */
export type MarketplaceApi = ReturnType<typeof createSearchApi> & ReturnType<typeof createAgencyProfilesApi>;

export function createApi(): MarketplaceApi {
  const client = new ApiClient({
    baseUrl: String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000'),
  });
  return { ...createSearchApi(client), ...createAgencyProfilesApi(client) };
}

export type {
  AgencyProfileDto,
  PublicBranchDto,
  PublicVehicleDetailDto,
  SearchOfferDto,
  SearchOffersQueryInput,
  VehicleDetailResponseDto,
} from '@kavriqo/api-client';
export { ApiError } from '@kavriqo/api-client';
