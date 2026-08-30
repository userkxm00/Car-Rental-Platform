import { Module } from '@nestjs/common';
import { InMemoryRateLimitStore } from './rate-limit/in-memory-rate-limit.store';
import { RateLimitGuard } from './rate-limit/rate-limit.guard';
import { RateLimitStore } from './rate-limit/rate-limit.store';

/**
 * Security hardening module (01-E02).
 *
 * Rate limiting for sensitive routes; the store swaps to Redis when its
 * integration phase activates (docs/provider-and-environment-contract.md).
 */
@Module({
  providers: [{ provide: RateLimitStore, useClass: InMemoryRateLimitStore }, RateLimitGuard],
  exports: [RateLimitStore, RateLimitGuard],
})
export class SecurityModule {}
