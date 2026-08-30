import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { APP_ENV } from '../../config/app-env.token';
import type { AppEnv } from '@kavriqo/config';

/**
 * Application PrismaClient (01-C01/01-C02).
 *
 * - Uses the pg driver adapter + WASM query compiler so no native engine
 *   binary is required at runtime (see prisma.config.ts and TESTING.md).
 * - Owned by the identity/data layer; services receive this token instead of
 *   constructing clients.
 * - Releases the pool on shutdown so tests and the server drain cleanly.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
    await this.pool.end().catch(() => undefined);
  }
}
