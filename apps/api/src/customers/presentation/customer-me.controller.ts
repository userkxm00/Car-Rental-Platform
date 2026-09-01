import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import { AuthPrincipal } from '../../auth/auth.guard';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import {
  CustomerDetailResponse,
  CustomerInput,
  CustomerProfileListItem,
  CustomerResponse,
  DocumentInput,
  DocumentResponse,
  FavoriteItem,
  RecentlyViewedInput,
  RecentlyViewedItem,
  SearchHistoryInput,
  SearchHistoryResponse,
} from '../domain/customer-contract';
import { CustomerSelfService } from '../application/customer-self.service';

/**
 * Marketplace self-service surface (07-A).
 *
 * All routes resolve the caller's application identity from the verified
 * token (never from client input) and operate only on customer records
 * linked to that user (`customers.userId`, 07-A02):
 *
 * - GET    /api/v1/me/customers — my customer records across agencies.
 * - GET    /api/v1/me/customers/:customerId — own record + documents +
 *   requirements state.
 * - PATCH  /api/v1/me/customers/:customerId — profile settings (07-A03).
 * - Documents: GET/POST/PATCH own documents (07-A04; verified documents are
 *   staff-immutable).
 * - Favorites (07-A05), recently viewed (07-A06) and search history
 *   (07-A07): /me/favorites, /me/recently-viewed, /me/search-history.
 */
@Controller('me')
export class CustomerMeController {
  constructor(
    private readonly service: CustomerSelfService,
    private readonly identityResolution: IdentityResolutionService,
  ) {}

  @Get('customers')
  async listMyProfiles(@AuthPrincipal() principal: VerifiedPrincipal): Promise<CustomerProfileListItem[]> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listMyProfiles(userId);
  }

  @Get('customers/:customerId')
  async getMyProfile(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('customerId') customerId: string,
  ): Promise<CustomerDetailResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.getMyProfile(userId, customerId);
  }

  @Patch('customers/:customerId')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  async updateMyProfile(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('customerId') customerId: string,
    @Body() body: CustomerInput,
  ): Promise<CustomerResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.updateMyProfile(userId, customerId, body ?? {});
  }

  @Get('customers/:customerId/documents')
  async listMyDocuments(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('customerId') customerId: string,
  ): Promise<DocumentResponse[]> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listMyDocuments(userId, customerId);
  }

  @Post('customers/:customerId/documents')
  @HttpCode(201)
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  async addMyDocument(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('customerId') customerId: string,
    @Body() body: DocumentInput,
  ): Promise<DocumentResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.addMyDocument(userId, customerId, body ?? {});
  }

  @Patch('customers/:customerId/documents/:documentId')
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  async updateMyDocument(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Body() body: DocumentInput,
  ): Promise<DocumentResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.updateMyDocument(userId, customerId, documentId, body ?? {});
  }

  @Get('favorites')
  async listFavorites(@AuthPrincipal() principal: VerifiedPrincipal): Promise<FavoriteItem[]> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listFavorites(userId);
  }

  @Put('favorites/:vehicleId')
  @HttpCode(201)
  async addFavorite(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('vehicleId') vehicleId: string,
  ): Promise<FavoriteItem> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.addFavorite(userId, vehicleId);
  }

  @Delete('favorites/:vehicleId')
  @HttpCode(200)
  async removeFavorite(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Param('vehicleId') vehicleId: string,
  ): Promise<{ removed: boolean }> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.removeFavorite(userId, vehicleId);
  }

  @Post('recently-viewed')
  @HttpCode(201)
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 120 })
  async recordView(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Body() body: RecentlyViewedInput,
  ): Promise<{ recorded: boolean }> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.recordView(userId, body ?? {});
  }

  @Get('recently-viewed')
  async listRecentlyViewed(@AuthPrincipal() principal: VerifiedPrincipal): Promise<RecentlyViewedItem[]> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listRecentlyViewed(userId);
  }

  @Delete('recently-viewed')
  @HttpCode(200)
  async clearRecentlyViewed(
    @AuthPrincipal() principal: VerifiedPrincipal,
  ): Promise<{ cleared: boolean }> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.clearRecentlyViewed(userId);
  }

  @Post('search-history')
  @HttpCode(201)
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 60 })
  async recordSearch(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Body() body: SearchHistoryInput,
  ): Promise<SearchHistoryResponse> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.recordSearch(userId, body ?? {});
  }

  @Get('search-history')
  async listSearchHistory(@AuthPrincipal() principal: VerifiedPrincipal): Promise<SearchHistoryResponse[]> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.listSearchHistory(userId);
  }

  @Delete('search-history')
  @HttpCode(200)
  async clearSearchHistory(
    @AuthPrincipal() principal: VerifiedPrincipal,
  ): Promise<{ cleared: boolean }> {
    const userId = await this.identityResolution.resolve(principal);
    return this.service.clearSearchHistory(userId);
  }
}
