import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { FleetModule } from '../fleet/fleet.module';
import { MediaService } from './application/media.service';
import { MediaRepository } from './infrastructure/media.repository';
import { R2ObjectStorage } from './infrastructure/r2-object-storage';
import { LocalTempObjectStorage } from './infrastructure/local-temp-object-storage';
import { ObjectStorage } from './ports/object-storage.port';
import { MediaController } from './presentation/media.controller';
import { APP_ENV } from '../config/app-env.token';
import type { AppEnv } from '@kavriqo/config';

/**
 * Vehicle media/documents module (03-C).
 *
 * Private-object policy: binary content goes to Cloudflare R2 behind the
 * {@link ObjectStorage} port; PostgreSQL stores metadata only; clients read
 * exclusively via short-lived signed URLs. Tests override the storage token
 * with a local double — production always wires R2.
 *
 * 08-C06: development environments without R2 credentials fall back to the
 * in-memory local double so generated contract/receipt PDFs stay
 * exercisable; production (`NODE_ENV=production`) always wires R2 and
 * fails loudly when credentials are missing.
 */
function storageFactory(env: AppEnv): ObjectStorage {
  if (env.NODE_ENV === 'production') {
    return new R2ObjectStorage(env);
  }
  if (env.R2_ACCESS_KEY_ID && env.R2_ACCESS_KEY_ID.length > 0) {
    return new R2ObjectStorage(env);
  }
  return new LocalTempObjectStorage();
}

@Module({
  imports: [FleetModule, IdentityModule, AuthorizationModule],
  controllers: [MediaController],
  providers: [
    MediaRepository,
    MediaService,
    {
      provide: ObjectStorage,
      inject: [APP_ENV],
      useFactory: storageFactory,
    },
  ],
  exports: [MediaService, ObjectStorage],
})
export class MediaModule {}
