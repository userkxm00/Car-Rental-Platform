/**
 * Identity mapping port (01-B03).
 *
 * Translates a provider subject into the application's own user identity.
 * Provider IDs must never be scattered through domain logic; domain entities
 * reference application user IDs only.
 *
 * The database-backed implementation arrives with the users migration in
 * 01-C; this port keeps the auth boundary independent of storage.
 */
export interface IdentityMapper {
  /**
   * Resolve the application user ID for a verified provider subject.
   * Returns `undefined` when the subject is not yet known to the
   * application (handled by the provisioning policy — see 01-B04).
   */
  findUserIdByProviderSubject(subject: string): Promise<string | undefined>;

  /** Record a provider subject → application user mapping. */
  linkProviderSubject(subject: string, userId: string): Promise<void>;
}
