import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IdentityModule } from '../identity/identity.module';
import { LocationsModule } from '../locations/locations.module';
import { CategoriesService } from './application/categories.service';
import { VehiclesService } from './application/vehicles.service';
import { CategoryRepository } from './infrastructure/category.repository';
import { VehicleRepository } from './infrastructure/vehicle.repository';
import { CategoriesController } from './presentation/categories.controller';
import { VehiclesController } from './presentation/vehicles.controller';

/**
 * Fleet module (03-A/03-B): vehicle categories and vehicles with
 * server-authoritative lifecycle, branch assignment and odometer history.
 */
@Module({
  imports: [LocationsModule, IdentityModule, AuthorizationModule],
  controllers: [CategoriesController, VehiclesController],
  providers: [CategoryRepository, VehicleRepository, CategoriesService, VehiclesService],
  exports: [CategoryRepository, VehicleRepository, CategoriesService, VehiclesService],
})
export class FleetModule {}
