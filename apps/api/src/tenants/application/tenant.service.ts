import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Tenant, TenantStatus, TenantVerificationStatus } from '@prisma/client';
import { TENANT_NAME_MAX, TenantErrorCode } from '../domain/tenant-errors';
import {
  CreateTenantInput,
  TenantRepository,
  UpdateTenantSettingsInput,
} from '../infrastructure/tenant.repository';

export interface CreateTenantCommand {
  name: string;
  slug: string;
  legalName?: string;
  defaultLocale?: string;
  defaultTimezone?: string;
  defaultCurrency?: string;
}

const SUPPORTED_LOCALES = ['ar', 'fr', 'en'] as const;
const CURRENCY_SHAPE = /^[A-Z]{3}$/;
/** IANA-style zone names, matching the profile convention (01-C04). */
const TIMEZONE_SHAPE = /^[A-Za-z_+-]{1,32}(\/[A-Za-z0-9_+-]{1,32})+$/;

/**
 * Tenant use-cases (02-A02…A07): creation, public identity, settings,
 * marketplace participation, verification and lifecycle transitions.
 *
 * This service is policy: it validates inputs and delegates persistence to
 * {@link TenantRepository}. Authorization for these operations is attached by
 * the consuming modules (platform/agency guards, 01-D) — this service never
 * trusts client-supplied ownership.
 */
@Injectable()
export class TenantService {
  constructor(private readonly tenants: TenantRepository) {}

  async create(command: CreateTenantCommand): Promise<Tenant> {
    this.validateCreate(command);
    const input: CreateTenantInput = {
      name: command.name.trim(),
      slug: command.slug.trim().toLowerCase(),
      ...(command.legalName !== undefined ? { legalName: command.legalName } : {}),
      ...(command.defaultLocale !== undefined ? { defaultLocale: command.defaultLocale } : {}),
      ...(command.defaultTimezone !== undefined
        ? { defaultTimezone: command.defaultTimezone }
        : {}),
      ...(command.defaultCurrency !== undefined
        ? { defaultCurrency: command.defaultCurrency }
        : {}),
    };
    return this.tenants.create(input);
  }

  /** Public identity lookup (02-A04): slug → tenant. */
  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenants.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundException({
        code: TenantErrorCode.TENANT_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    return tenant;
  }

  async getById(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(id);
    if (!tenant) {
      throw new NotFoundException({
        code: TenantErrorCode.TENANT_NOT_FOUND,
        message: 'Agency not found.',
      });
    }
    return tenant;
  }

  /** Tenant settings (02-A05). */
  async updateSettings(id: string, input: UpdateTenantSettingsInput): Promise<Tenant> {
    this.validateSettings(input);
    return this.tenants.updateSettings(id, input);
  }

  /** Marketplace participation flag (02-A06). */
  async setMarketplaceEnabled(id: string, enabled: boolean): Promise<Tenant> {
    return this.tenants.setMarketplaceEnabled(id, enabled);
  }

  /** Lifecycle transitions (02-A03): suspend / reactivate / archive. */
  async transitionStatus(id: string, to: TenantStatus): Promise<Tenant> {
    return this.tenants.transitionStatus(id, to);
  }

  /** Verification flow (02-A07). */
  async transitionVerification(id: string, to: TenantVerificationStatus): Promise<Tenant> {
    return this.tenants.transitionVerification(id, to);
  }

  private validateCreate(command: CreateTenantCommand): void {
    const failures: string[] = [];
    if (typeof command.name !== 'string' || command.name.trim().length === 0) {
      failures.push('name: must be a non-empty string');
    } else if (command.name.trim().length > TENANT_NAME_MAX) {
      failures.push(`name: must be at most ${TENANT_NAME_MAX} characters`);
    }
    if (
      command.defaultLocale !== undefined &&
      !(SUPPORTED_LOCALES as readonly string[]).includes(command.defaultLocale)
    ) {
      failures.push('defaultLocale: must be one of ar, fr, en');
    }
    if (command.defaultCurrency !== undefined && !CURRENCY_SHAPE.test(command.defaultCurrency)) {
      failures.push('defaultCurrency: must be a 3-letter ISO 4217 code');
    }
    if (
      command.defaultTimezone !== undefined &&
      command.defaultTimezone !== null &&
      (!TIMEZONE_SHAPE.test(command.defaultTimezone) || command.defaultTimezone.length > 64)
    ) {
      failures.push('defaultTimezone: must be an IANA-style zone name');
    }
    if (failures.length > 0) {
      throw new BadRequestException({
        code: TenantErrorCode.TENANT_VALIDATION_FAILED,
        message: 'Tenant input contains invalid fields.',
        details: { failures },
      });
    }
  }

  private validateSettings(input: UpdateTenantSettingsInput): void {
    const failures: string[] = [];
    if (
      input.name !== undefined &&
      (input.name.trim().length === 0 || input.name.trim().length > TENANT_NAME_MAX)
    ) {
      failures.push(`name: must be 1-${TENANT_NAME_MAX} characters`);
    }
    if (
      input.defaultLocale !== undefined &&
      !(SUPPORTED_LOCALES as readonly string[]).includes(input.defaultLocale)
    ) {
      failures.push('defaultLocale: must be one of ar, fr, en');
    }
    if (input.defaultCurrency !== undefined && !CURRENCY_SHAPE.test(input.defaultCurrency)) {
      failures.push('defaultCurrency: must be a 3-letter ISO 4217 code');
    }
    if (
      input.defaultTimezone !== undefined &&
      input.defaultTimezone !== null &&
      (!TIMEZONE_SHAPE.test(input.defaultTimezone) || input.defaultTimezone.length > 64)
    ) {
      failures.push('defaultTimezone: must be an IANA-style zone name');
    }
    if (failures.length > 0) {
      throw new BadRequestException({
        code: TenantErrorCode.TENANT_VALIDATION_FAILED,
        message: 'Tenant settings contain invalid fields.',
        details: { failures },
      });
    }
  }
}
