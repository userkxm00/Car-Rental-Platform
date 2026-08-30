/**
 * Platform-admin grant store port (01-D03).
 *
 * Platform administration is a separate authorization boundary
 * (architecture/authentication-authorization.md): a platform admin grant is
 * never a membership role, and nothing a client sends can create one.
 * The provisioning phase supplies the database-backed implementation;
 * until then the store correctly reports no grants.
 */
export abstract class PlatformAdminStore {
  abstract isPlatformAdmin(userId: string): Promise<boolean>;
}
