import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { FleetModule } from '../fleet/fleet.module';
import { MediaService } from './application/media.service';
import { MediaRepository } from './infrastructure/media.repository';
import { R2ObjectStorage } from './infrastructure/r2-object-storage';
import { ObjectStorage } from './ports/object-storage.port';
import { MediaController } from './presentation/media.controller';

/**
 * Vehicle media/documents module (03-C).
 *
 * Private-object policy: binary content goes to Cloudflare R2 behind the
 * {@link ObjectStorage} port; PostgreSQL stores metadata only; clients read
 * exclusively via short-lived signed URLs. Tests override the storage token
 * with a local double — production always wires R2.
 */
@Module({
  imports: [FleetModule, IdentityModule, AuthorizationModule],
  controllers: [MediaController],
  providers: [MediaRepository, MediaService, { provide: ObjectStorage, useClass: R2ObjectStorage }],
  exports: [MediaService, ObjectStorage],
})
export class MediaModule {}
