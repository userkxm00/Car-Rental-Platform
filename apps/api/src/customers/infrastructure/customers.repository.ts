import { Injectable } from '@nestjs/common';
import { Prisma, type Customer, type CustomerDocument, type CustomerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tenant-scoped customer persistence (07-A01).
 *
 * Every read/write takes the verified tenant id and forces it into the
 * where/data clause (02-D02 repository helpers pattern): a missing or
 * mismatched scope can never touch another agency's customer records.
 * Document rows are always resolved through their owning customer in the
 * same tenant.
 */

export interface CustomerListFilter {
  search?: string;
  status?: CustomerStatus;
  limit: number;
  offset: number;
}

export interface CustomerDocumentPatch {
  number?: string | null;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedAt?: Date | null;
  verifiedBy?: string | null;
  rejectionReason?: string | null;
}

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomer(data: {
    tenantId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    preferredLocale: string;
    dateOfBirth: Date | null;
    licenseNumber: string | null;
    licenseCountry: string | null;
    licenseIssueDate: Date | null;
    licenseExpiryDate: Date | null;
  }): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  async findCustomerInTenant(tenantId: string, customerId: string): Promise<Customer | undefined> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    return customer ?? undefined;
  }

  async findCustomerByUserId(tenantId: string, userId: string): Promise<Customer | undefined> {
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, userId } });
    return customer ?? undefined;
  }

  async listCustomers(
    tenantId: string,
    filter: CustomerListFilter,
  ): Promise<{ rows: Customer[]; total: number }> {
    const where: Prisma.CustomerWhereInput = { tenantId };
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.search && filter.search.trim().length > 0) {
      const search = filter.search.trim();
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { licenseNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: filter.offset,
        take: filter.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { rows, total };
  }

  async updateCustomer(
    tenantId: string,
    customerId: string,
    patch: Prisma.CustomerUpdateInput,
  ): Promise<Customer | undefined> {
    const updated = await this.prisma.customer.updateMany({
      where: { id: customerId, tenantId },
      data: patch,
    });
    if (updated.count === 0) {
      return undefined;
    }
    return this.findCustomerInTenant(tenantId, customerId);
  }

  /** 07-A02: attach a platform user to a customer record (tenant-scoped). */
  async linkCustomer(tenantId: string, customerId: string, userId: string): Promise<Customer> {
    await this.prisma.customer.updateMany({
      where: { id: customerId, tenantId },
      data: { userId },
    });
    const linked = await this.findCustomerInTenant(tenantId, customerId);
    if (!linked) {
      throw new Error('Customer record disappeared during link.');
    }
    return linked;
  }

  async unlinkCustomer(tenantId: string, customerId: string): Promise<Customer> {
    await this.prisma.customer.updateMany({
      where: { id: customerId, tenantId },
      data: { userId: null },
    });
    const unlinked = await this.findCustomerInTenant(tenantId, customerId);
    if (!unlinked) {
      throw new Error('Customer record disappeared during unlink.');
    }
    return unlinked;
  }

  /** Platform user lookup for account linkage (by verified email). */
  async findUserByEmail(email: string): Promise<{ id: string; status: string } | undefined> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ?? undefined;
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async listDocumentsForCustomer(customerId: string): Promise<CustomerDocument[]> {
    return this.prisma.customerDocument.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findDocument(customerId: string, documentId: string): Promise<CustomerDocument | undefined> {
    const document = await this.prisma.customerDocument.findFirst({
      where: { id: documentId, customerId },
    });
    return document ?? undefined;
  }

  async createDocument(data: {
    customerId: string;
    type: CustomerDocument['type'];
    number: string | null;
    issueDate: Date | null;
    expiryDate: Date | null;
  }): Promise<CustomerDocument> {
    return this.prisma.customerDocument.create({ data });
  }

  async updateDocument(
    customerId: string,
    documentId: string,
    patch: CustomerDocumentPatch,
  ): Promise<CustomerDocument | undefined> {
    const updated = await this.prisma.customerDocument.updateMany({
      where: { id: documentId, customerId },
      data: patch,
    });
    if (updated.count === 0) {
      return undefined;
    }
    return this.findDocument(customerId, documentId);
  }
}
