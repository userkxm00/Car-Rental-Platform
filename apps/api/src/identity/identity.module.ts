import { Module } from '@nestjs/common';
import { IdentityResolutionService } from '../auth/application/identity-resolution.service';
import { IdentityStore } from '../auth/ports/identity-store.port';
import { SecurityModule } from '../security/security.module';
import { UserProfileService } from './application/user-profile.service';
import { PrismaIdentityStore } from './infrastructure/prisma-identity-store';
import { UserRepository } from './infrastructure/user.repository';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileController } from './presentation/profile.controller';

/**
 * User identity module (01-C).
 *
 * Owns users/user_identities persistence, provider→user identity resolution
 * and the profile use-cases. Supplies the database-backed {@link IdentityStore}
 * the 01-B auth boundary consumes, so verified principals now provision and
 * resolve against PostgreSQL.
 */
@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [ProfileController],
  providers: [
    UserRepository,
    PrismaIdentityStore,
    { provide: IdentityStore, useExisting: PrismaIdentityStore },
    IdentityResolutionService,
    UserProfileService,
  ],
  exports: [IdentityStore, IdentityResolutionService, UserRepository],
})
export class IdentityModule {}
