import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SessionRevocationBoundary } from './ports/session-revocation.port';
import { AuthFailureError, AuthProvider, VerifiedPrincipal } from './ports/auth-provider.port';
import { AuthRequest } from './auth-principal';

export const IS_PUBLIC_KEY = 'auth:public';

/** Marks a route (or controller) as unauthenticated. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the verified principal into a handler parameter. */
export const AuthPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    return request.authPrincipal as VerifiedPrincipal;
  },
);

const AUTH_FAILURE_STATUS: Record<string, { status: number; code: string; message: string }> = {
  TOKEN_MISSING: { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required.' },
  TOKEN_INVALID: { status: 401, code: 'TOKEN_INVALID', message: 'The access token is invalid.' },
  TOKEN_EXPIRED: { status: 401, code: 'TOKEN_EXPIRED', message: 'The access token has expired.' },
  TOKEN_REVOKED: { status: 401, code: 'TOKEN_REVOKED', message: 'This session has been revoked.' },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    code: 'PROVIDER_UNAVAILABLE',
    message: 'The identity provider is temporarily unavailable.',
  },
};

/**
 * Server-side authentication guard.
 *
 * Extracts the bearer token, verifies it through the provider boundary, and
 * attaches the verified principal to the request. Routes opt out with
 * {@link Public}. Authorization (roles/permissions/tenant scope) is a
 * separate layer (01-D) and is never derived from provider claims.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authProvider: AuthProvider,
    private readonly reflector: Reflector,
    private readonly revocation: SessionRevocationBoundary,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;

    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (token.length === 0) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    try {
      const principal = await this.authProvider.verifyAccessToken(token);
      if (await this.revocation.isRevoked(principal)) {
        throw new AuthFailureError('TOKEN_REVOKED', 'Session has been revoked.');
      }
      (request as AuthRequest).authPrincipal = principal;
      return true;
    } catch (error) {
      throw this.mapAuthFailure(error);
    }
  }

  private mapAuthFailure(error: unknown): Error {
    if (error instanceof AuthFailureError) {
      const mapping = AUTH_FAILURE_STATUS[error.code];
      if (mapping.status === 503) {
        return new ServiceUnavailableException({ code: mapping.code, message: mapping.message });
      }
      return new UnauthorizedException({ code: mapping.code, message: mapping.message });
    }
    // Unexpected verification failures degrade as provider unavailability —
    // they never grant access.
    return new ServiceUnavailableException({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'The identity provider is temporarily unavailable.',
    });
  }
}
