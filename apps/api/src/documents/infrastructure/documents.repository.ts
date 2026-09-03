import { Injectable } from '@nestjs/common';
import type { AgencyDocumentPolicy, CustomerDocument } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PHASE-08 / 08-A persistence: the agency's document policy row and the
 * customer document records the checklist consumes.
 *
 * Reads are tenant-scoped through the policy's unique tenant key and the
 * customer records' tenant ownership (re-checked by the service).
 */

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPolicy(tenantId: string): Promise<AgencyDocumentPolicy | null> {
    return this.prisma.agencyDocumentPolicy.findUnique({ where: { tenantId } });
  }

  async upsertPolicy(
    tenantId: string,
    data: { requiredTypes: AgencyDocumentPolicy['requiredTypes']; requirePassportForForeignLicense: boolean },
  ): Promise<AgencyDocumentPolicy> {
    return this.prisma.agencyDocumentPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  /** The customer record (tenant-scoped) the checklist evaluates. */
  async findCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<{ id: string; licenseCountry: string | null } | null> {
    return this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, licenseCountry: true },
    });
  }

  async listCustomerDocuments(customerId: string): Promise<CustomerDocument[]> {
    return this.prisma.customerDocument.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 08-A04: the booking context the checklist gate evaluates. */
  async findBookingContext(
    tenantId: string,
    bookingId: string,
  ): Promise<{ id: string; customerId: string | null; startsAt: Date; endsAt: Date } | null> {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: { id: true, customerId: true, startsAt: true, endsAt: true },
    });
  }
}
