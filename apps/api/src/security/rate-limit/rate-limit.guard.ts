import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthorizedRequest } from '../../authorization/guard/permission.guard';
import { RateLimitStore } from './rate-limit.store';

export const RATE_LIMIT_KEY = 'security:rate-limit';

export interface RateLimitOptions {
  /** Fixed window length in milliseconds. */
  windowMs: number;
  /** Maximum requests per window. */
  max: number;
}

export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Rate-limit guard for sensitive routes (01-E02).
 *
 * Keys requests by the server-resolved application user when authenticated,
 * else by client IP — never by client-supplied identity fields. Exceeding
 * the window yields the documented 429 RATE_LIMITED envelope.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & AuthorizedRequest>();
    const key = this.resolveKey(request);
    const entry = await this.store.hit(key, options.windowMs);

    if (entry.count > options.max) {
      const retryAfterMs = Math.max(1, options.windowMs - (Date.now() - entry.windowStartedAt));
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please retry shortly.',
          details: { retryAfterSeconds: Math.ceil(retryAfterMs / 1000) },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private resolveKey(request: Request & AuthorizedRequest): string {
    // Key by the verified identity when present (server-attached by
    // AuthGuard), else by client IP. Client-supplied identity fields are
    // never part of the key.
    if (request.authUserId) {
      return `user:${request.authUserId}`;
    }
    if (request.authPrincipal) {
      return `subject:${request.authPrincipal.subject}`;
    }
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    return `ip:${ip}`;
  }
}
