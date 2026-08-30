import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { DatabaseHealthService } from './database-health.service';

/**
 * Liveness/readiness signals (architecture/infrastructure-and-deployment.md).
 *
 * - `live`: the process is up — never depends on external services.
 * - `ready`: the process can serve traffic — PostgreSQL must be reachable.
 *
 * Both endpoints are public by design (load balancers/probes are
 * unauthenticated); they expose no business data.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly databaseHealth: DatabaseHealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'ok'; service: string; timestamp: string } {
    return { status: 'ok', service: 'kavriqo-api', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<{ status: 'ready'; checks: { database: 'up' } }> {
    const database = await this.databaseHealth.check();
    if (database.status !== 'up') {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is not ready.',
        details: { database: 'down' },
      });
    }
    return { status: 'ready', checks: { database: 'up' } };
  }
}
