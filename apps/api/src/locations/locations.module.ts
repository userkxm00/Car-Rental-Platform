import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BranchesService } from './application/branches.service';
import { DeliveryZonesService } from './application/delivery-zones.service';
import { LocationsService } from './application/locations.service';
import { LocationsRepository } from './infrastructure/locations.repository';

/**
 * Branches & locations module (02-C).
 *
 * Canonical locations (global + tenant), branches with per-tenant codes,
 * operating/exception hours and the delivery-zone baseline. Tenant scoping
 * is enforced in every service operation; controllers and guards attach at
 * the fleet/operations phases.
 */
@Module({
  imports: [PrismaModule],
  providers: [LocationsRepository, BranchesService, LocationsService, DeliveryZonesService],
  exports: [LocationsRepository, BranchesService, LocationsService, DeliveryZonesService],
})
export class LocationsModule {}
