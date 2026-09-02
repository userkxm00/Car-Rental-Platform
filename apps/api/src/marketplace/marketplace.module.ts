import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';
import { SecurityModule } from '../security/security.module';
import { AgencyProfilesService } from './application/agency-profiles.service';
import { AgencyProfileRepository } from './infrastructure/agency-profile.repository';
import { AgencyProfilesController } from './presentation/agency-profiles.controller';

/**
 * PHASE-07 / 07-D public marketplace profiles.
 *
 * Read-only agency profile surface (identity, branches, fleet, vehicle
 * details, gallery URLs) over participating agencies only. The fleet and
 * vehicle detail routes reuse the 07-B offer pipeline (availability +
 * pricing) so every displayed offer is actually bookable.
 */
@Module({
  imports: [SearchModule, MediaModule, SecurityModule],
  controllers: [AgencyProfilesController],
  providers: [AgencyProfilesService, AgencyProfileRepository],
  exports: [AgencyProfilesService],
})
export class MarketplaceModule {}
