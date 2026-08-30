import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import {
  CategoriesService,
  CreateCategoryCommand,
  UpdateCategoryCommand,
} from '../application/categories.service';
import { CategoryRow } from '../infrastructure/category.repository';

function toResponse(category: CategoryRow): unknown {
  return {
    id: category.id,
    agencyId: category.tenantId,
    code: category.code,
    name: category.name,
    nameAr: category.nameAr,
    nameFr: category.nameFr,
    description: category.description,
    descriptionAr: category.descriptionAr,
    descriptionFr: category.descriptionFr,
    transmission: category.transmission,
    fuelType: category.fuelType,
    seats: category.seats,
    doors: category.doors,
    luggageCapacity: category.luggageCapacity,
    active: category.active,
    features: category.features,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

/**
 * Vehicle category CRUD API (03-A04) with server-side authorization (03-A05).
 * All routes require the caller's own active membership in the agency
 * (route param) plus the relevant fleet permission.
 */
@Controller('agencies/:agencyId/categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async list(
    @Param('agencyId') agencyId: string,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<unknown> {
    const rows = await this.service.list(agencyId, activeOnly !== 'false');
    return { categories: rows.map(toResponse) };
  }

  @Post()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_CREATE)
  async create(
    @Param('agencyId') agencyId: string,
    @Body() body: CreateCategoryCommand,
  ): Promise<unknown> {
    const category = await this.service.create(agencyId, body ?? {});
    return toResponse(category);
  }

  @Get(':categoryId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async get(
    @Param('agencyId') agencyId: string,
    @Param('categoryId') categoryId: string,
  ): Promise<unknown> {
    const category = await this.service.get(agencyId, categoryId);
    return toResponse(category);
  }

  @Patch(':categoryId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async update(
    @Param('agencyId') agencyId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateCategoryCommand,
  ): Promise<unknown> {
    const category = await this.service.update(agencyId, categoryId, body ?? {});
    return toResponse(category);
  }

  @Patch(':categoryId/active')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_ARCHIVE)
  async setActive(
    @Param('agencyId') agencyId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: { active: boolean },
  ): Promise<unknown> {
    const category = await this.service.setActive(agencyId, categoryId, body.active);
    return toResponse(category);
  }
}
