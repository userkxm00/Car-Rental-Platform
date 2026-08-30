import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { config as loadDotenv } from 'dotenv';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { StructuredLogger } from './common/observability/structured-logger';

/**
 * Optional local development convenience: load a `.env` file from the API
 * workspace or the repository root when present. Real environments inject
 * variables through their own secure mechanism (container env, secret
 * managers) — no specific secret manager is required.
 */
function loadOptionalDotenvFiles(): void {
  for (const candidate of [resolve(__dirname, '../../../.env'), resolve(process.cwd(), '.env')]) {
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, override: false });
    }
  }
}

/**
 * Bootstrap the KAVRIQO API.
 *
 * - Environment is validated fail-fast by ConfigModule at bootstrap; invalid
 *   or missing configuration aborts startup instead of running with unsafe
 *   defaults (01-A03/01-A04).
 * - Global prefix `/api` + URI versioning exposes `/api/v1/*` (01-A05).
 * - Port comes from `PORT` (default 4000); the server binds 0.0.0.0 so it
 *   works in containers and local tooling alike.
 * - Graceful shutdown lets in-flight requests drain on SIGTERM/SIGINT.
 */
async function bootstrap(): Promise<void> {
  loadOptionalDotenvFiles();

  const logger = new StructuredLogger({ nodeEnv: process.env.NODE_ENV });
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(logger);

  configureApp(app);

  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen(port, host);

  logger.log(`KAVRIQO API listening on http://${host}:${port}/api/v1`, 'Bootstrap');
}

void bootstrap();
