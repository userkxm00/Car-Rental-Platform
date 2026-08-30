import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IdentityResolutionService } from '../../auth/application/identity-resolution.service';
import { AuthPrincipal } from '../../auth/auth.guard';
import type { VerifiedPrincipal } from '../../auth/ports/auth-provider.port';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import { ProfileUpdateInput, UserProfileService } from '../application/user-profile.service';

/**
 * Authenticated profile endpoints (01-C06) — GET/PATCH /api/v1/me.
 *
 * The caller's application identity is resolved server-side from the
 * signature-verified token (never from client-supplied IDs), so users can
 * only read or update their own profile.
 */
@Controller('me')
export class ProfileController {
  constructor(
    private readonly profileService: UserProfileService,
    private readonly identityResolution: IdentityResolutionService,
  ) {}

  @Get()
  async get(@AuthPrincipal() principal: VerifiedPrincipal): Promise<unknown> {
    const userId = await this.identityResolution.resolve(principal);
    const profile = await this.profileService.getProfile(userId);
    return {
      id: profile.id,
      email: profile.email,
      phone: profile.phone,
      displayName: profile.displayName,
      preferredLocale: profile.preferredLocale,
      timezone: profile.timezone,
      status: profile.status,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  @Patch()
  @UseGuards(RateLimitGuard)
  @RateLimit({ windowMs: 60_000, max: 30 })
  async patch(
    @AuthPrincipal() principal: VerifiedPrincipal,
    @Body() input: ProfileUpdateInput,
  ): Promise<unknown> {
    const userId = await this.identityResolution.resolve(principal);
    const { updated, changed } = await this.profileService.updateProfile(userId, input ?? {});
    return {
      id: updated.id,
      displayName: updated.displayName,
      preferredLocale: updated.preferredLocale,
      timezone: updated.timezone,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      changed,
    };
  }
}
