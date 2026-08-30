import type { Request } from 'express';
import type { VerifiedPrincipal } from './ports/auth-provider.port';

/**
 * Request augmentation: the signature-verified principal attached by the
 * {@link AuthGuard}. Present only on guarded routes; guards must never read
 * provider claims for authorization decisions.
 */
export interface AuthRequest extends Request {
  authPrincipal?: VerifiedPrincipal;
}

/** True when the request carries a verified principal. */
export function hasAuthPrincipal(request: Request): request is AuthRequest {
  return (request as AuthRequest).authPrincipal !== undefined;
}
