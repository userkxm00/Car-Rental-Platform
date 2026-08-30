import type { VerifiedPrincipal } from './auth-provider.port';

/**
 * Provisioning policy port (01-B04).
 *
 * Decides what happens when a verified token arrives for a subject the
 * application does not know yet. The default policy provisions an
 * application user from VERIFIED claims only — it never provisions from
 * unverified email, and it never reads authorization-relevant metadata.
 */
export interface ProvisioningPolicy {
  /**
   * Create an application user for a verified principal and return the new
   * application user ID. Implementations must be idempotent per subject.
   */
  provisionUser(principal: VerifiedPrincipal): Promise<string>;
}
