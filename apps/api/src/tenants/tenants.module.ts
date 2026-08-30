import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantService } from './application/tenant.service';
import { TenantRepository } from './infrastructure/tenant.repository';

/**
 * Agency/tenant module (02-A).
 *
 * Tenant persistence, lifecycle, settings, marketplace participation and
 * verification. Authorization for tenant operations is attached by consuming
 * modules (platform/agency guards) — nothing here trusts client ownership.
 */
@Module({
  imports: [PrismaModule],
  providers: [TenantRepository, TenantService],
  exports: [TenantRepository, TenantService],
})
export class TenantsModule {}
