import { ApiClient, createSearchApi } from '@kavriqo/api-client';

/**
 * Public marketplace API wiring (no token — the search surface is
 * public). Base URL comes from the Vite environment (VITE_API_URL),
 * defaulting to the local API on /api/v1.
 */
export function createApi(): ReturnType<typeof createSearchApi> {
  const client = new ApiClient({
    baseUrl: String(import.meta.env.VITE_API_URL ?? 'http://localhost:4000'),
  });
  return createSearchApi(client);
}

export type { SearchOfferDto, SearchOffersQueryInput, MarketplaceBranchLocationDto } from '@kavriqo/api-client';
export { ApiError } from '@kavriqo/api-client';
