import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_ENV } from '../config/app-env.token';
import type { AppEnv } from '@kavriqo/config';

export interface DatabaseHealth {
  status: 'up' | 'down';
}

/**
 * Lightweight database reachability probe.
 *
 * Uses a minimal `pg` client (separate from Prisma, which owns the
 * application data-access layer) so readiness can be reported even while the
 * ORM is unavailable. The probe is bounded (2s connection timeout) and never
 * blocks liveness. Probe failures are intentionally silent here: readiness
 * consumers see the result, and the probe must not spam logs while the
 * database is down.
 */
@Injectable()
export class DatabaseHealthService implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 30_000,
    });
    // A database outage must degrade readiness — never crash the process.
    // Without a listener, pg emits an unhandled 'error' event on idle
    // clients when the server goes away, which would kill the API.
    this.pool.on('error', () => undefined);
  }

  async check(): Promise<DatabaseHealth> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'up' };
    } catch {
      return { status: 'down' };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
