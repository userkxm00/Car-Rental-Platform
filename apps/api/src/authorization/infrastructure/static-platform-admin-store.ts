import { Injectable } from '@nestjs/common';
import { PlatformAdminStore } from '../ports/platform-admin.store';

/**
 * Platform-admin store with no grants.
 *
 * The platform-admin provisioning phase supplies the database-backed
 * implementation; until then the platform has zero administrators — the
 * truthful state — so all platform-boundary requests are denied and audited.
 */
@Injectable()
export class StaticPlatformAdminStore extends PlatformAdminStore {
  override isPlatformAdmin(_userId: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}
