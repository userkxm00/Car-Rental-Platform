import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../auth/auth.guard';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import { SearchService } from '../application/search.service';
import {
  SearchLocationsResponse,
  SearchOffersQuery,
  SearchOffersResponse,
} from '../domain/search-contract';

/**
 * Public marketplace search (07-B01).
 *
 * `GET /api/v1/search/offers` — cross-agency discovery open to browsing
 * customers (docs/40). No membership applies: participating agencies opt
 * in via `marketplaceEnabled`, and the response is strictly the public
 * offer shape. Rate-limited against unauthenticated scraping.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get('offers')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async searchOffers(@Query() query: SearchOffersQuery): Promise<SearchOffersResponse> {
    return this.service.searchOffers(query ?? {}, new Date());
  }

  /**
   * 07-C05/07-C06: public pickup-point feed (branches/parking/pickup) for
   * marketplace map pins. Privacy boundary: locations only — never exact
   * live vehicle positions (docs/07).
   */
  @Get('locations')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async searchLocations(): Promise<SearchLocationsResponse> {
    return this.service.listLocations();
  }
}
