import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Branch, BranchStatus, Prisma } from '@prisma/client';
import {
  BranchContacts,
  BranchErrorCode,
  isValidBranchCode,
  isValidContacts,
  NAME_MAX,
} from '../domain/branch-rules';
import { LocationsRepository } from '../infrastructure/locations.repository';

export interface CreateBranchCommand {
  name: string;
  code: string;
  locationId: string;
  timezone?: string;
  contacts?: BranchContacts;
}

const TIMEZONE_SHAPE = /^[A-Za-z_+-]{1,32}(\/[A-Za-z0-9_+-]{1,32})+$/;
const BRANCH_TRANSITIONS: Readonly<Record<BranchStatus, readonly BranchStatus[]>> = {
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE'],
  ARCHIVED: [],
};

/**
 * Branch use-cases (02-C01/03/06).
 *
 * Branch/location constraint (02-C03): a branch may reference a global
 * location or a location owned by the same tenant — never another tenant's
 * location. Reads are tenant-scoped by the caller-supplied server context.
 */
@Injectable()
export class BranchesService {
  constructor(private readonly repository: LocationsRepository) {}

  async createBranch(tenantId: string, command: CreateBranchCommand): Promise<Branch> {
    const failures: string[] = [];
    if (
      typeof command.name !== 'string' ||
      command.name.trim().length === 0 ||
      command.name.trim().length > NAME_MAX
    ) {
      failures.push(`name: must be 1-${NAME_MAX} characters`);
    }
    if (!isValidBranchCode(command.code)) {
      failures.push('code: must be 2-20 uppercase letters, digits or hyphens');
    }
    if (command.timezone !== undefined && !TIMEZONE_SHAPE.test(command.timezone)) {
      failures.push('timezone: must be an IANA-style zone name');
    }
    if (!isValidContacts(command.contacts)) {
      failures.push('contacts: only phone, email, whatsapp and notes keys are allowed');
    }
    if (failures.length > 0) {
      throw new ConflictException({
        code: BranchErrorCode.BRANCH_VALIDATION_FAILED,
        message: 'Branch input contains invalid fields.',
        details: { failures },
      });
    }

    const location = await this.repository.findLocation(command.locationId);
    if (!location) {
      throw new NotFoundException({
        code: BranchErrorCode.LOCATION_NOT_FOUND,
        message: 'Location not found.',
      });
    }
    if (location.tenantId !== null && location.tenantId !== tenantId) {
      throw new ConflictException({
        code: BranchErrorCode.LOCATION_TENANT_MISMATCH,
        message: 'A branch can only reference its own agency’s location or a global location.',
      });
    }

    try {
      return await this.repository.createBranch({
        tenantId,
        name: command.name.trim(),
        code: command.code,
        locationId: command.locationId,
        timezone: command.timezone,
        contacts: command.contacts,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: BranchErrorCode.BRANCH_CODE_TAKEN,
          message: 'This branch code is already taken within the agency.',
        });
      }
      throw error;
    }
  }

  async getBranch(tenantId: string, branchId: string): Promise<Branch> {
    const branch = await this.repository.findBranch(branchId);
    if (!branch || branch.tenantId !== tenantId) {
      throw new NotFoundException({
        code: BranchErrorCode.BRANCH_NOT_FOUND,
        message: 'Branch not found.',
      });
    }
    return branch;
  }

  async listBranches(tenantId: string): Promise<Branch[]> {
    return this.repository.listBranches(tenantId);
  }

  async setContacts(tenantId: string, branchId: string, contacts: BranchContacts): Promise<Branch> {
    await this.getBranch(tenantId, branchId);
    if (!isValidContacts(contacts)) {
      throw new ConflictException({
        code: BranchErrorCode.BRANCH_VALIDATION_FAILED,
        message: 'contacts: only phone, email, whatsapp and notes keys are allowed',
      });
    }
    return this.repository.updateBranchContacts(branchId, contacts);
  }

  async setStatus(tenantId: string, branchId: string, to: BranchStatus): Promise<Branch> {
    const branch = await this.getBranch(tenantId, branchId);
    if (!BRANCH_TRANSITIONS[branch.status].includes(to)) {
      throw new ConflictException({
        code: BranchErrorCode.BRANCH_VALIDATION_FAILED,
        message: `Branch status cannot change from ${branch.status} to ${to}.`,
      });
    }
    return this.repository.setBranchStatus(branchId, to);
  }
}
