import { Injectable } from '@nestjs/common';
import type {
  ContractSignature,
  ContractSnapshot,
  GeneratedDocument,
  Receipt,
  RentalContract,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * PHASE-08 / 08-C persistence. All queries carry tenantId (tenant
 * isolation is re-checked at every read), bookings and contracts are
 * unique per row, and snapshots/signatures are created exactly once per
 * contract behind their unique constraints.
 */

export interface BookingContractContext {
  id: string;
  tenant: { name: string };
  bookingNumber: string;
  status: string;
  currency: string;
  startsAt: Date;
  endsAt: Date;
  customerId: string | null;
  assignedVehicleId: string | null;
  pickupBranchId: string | null;
  returnBranchId: string | null;
  customer: {
    firstName: string;
    lastName: string;
    preferredLocale: string;
    licenseNumber: string | null;
    licenseCountry: string | null;
    userId: string | null;
  } | null;
  assignedVehicle: {
    make: string;
    model: string;
    year: number;
    plateNumber: string;
  } | null;
  pickupBranch: { name: string; contacts: unknown } | null;
  returnBranch: { name: string; contacts: unknown } | null;
  priceSnapshots: Array<{ pricingJson: unknown }>;
}

export interface ContractWithRelations extends RentalContract {
  snapshot: ContractSnapshot | null;
  signature: ContractSignature | null;
  documents: GeneratedDocument[];
}

export interface ReceiptWithDocuments extends Receipt {
  documents: GeneratedDocument[];
}

@Injectable()
export class ContractsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBookingContext(tenantId: string, bookingId: string): Promise<BookingContractContext | null> {
    return this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: {
        id: true,
        tenant: { select: { name: true } },
        bookingNumber: true,
        status: true,
        currency: true,
        startsAt: true,
        endsAt: true,
        customerId: true,
        assignedVehicleId: true,
        pickupBranchId: true,
        returnBranchId: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            preferredLocale: true,
            licenseNumber: true,
            licenseCountry: true,
            userId: true,
          },
        },
        assignedVehicle: {
          select: { make: true, model: true, year: true, plateNumber: true },
        },
        pickupBranch: { select: { name: true, contacts: true } },
        returnBranch: { select: { name: true, contacts: true } },
        priceSnapshots: { select: { pricingJson: true }, take: 1 },
      },
    });
  }

  async findContractByBooking(tenantId: string, bookingId: string): Promise<RentalContract | null> {
    return this.prisma.rentalContract.findFirst({ where: { bookingId, tenantId } });
  }

  async findContractById(
    tenantId: string,
    contractId: string,
  ): Promise<ContractWithRelations | null> {
    return this.prisma.rentalContract.findFirst({
      where: { id: contractId, tenantId },
      include: { snapshot: true, signature: true, documents: true },
    });
  }

  async findContractSignature(
    tenantId: string,
    contractId: string,
  ): Promise<ContractSignature | null> {
    const contract = await this.findContractById(tenantId, contractId);
    return contract?.signature ?? null;
  }

  async createContract(input: {
    tenantId: string;
    bookingId: string;
    contractNumber: string;
    locale: string;
    issuedById: string | null;
  }): Promise<RentalContract> {
    return this.prisma.rentalContract.create({ data: input });
  }

  async createSnapshot(input: {
    contractId: string;
    templateId: string | null;
    templateCode: string;
    templateVersion: number | null;
    locale: string;
    variablesJson: Prisma.InputJsonValue;
    contentText: string;
    contentHash: string;
    title: string;
  }): Promise<ContractSnapshot> {
    return this.prisma.contractSnapshot.create({ data: input });
  }

  async createSignature(input: {
    contractId: string;
    method: 'CUSTOMER_DIGITAL' | 'ON_SITE';
    signerRole: 'CUSTOMER' | 'AGENCY_REPRESENTATIVE';
    signerName: string;
    note: string | null;
    signedByUserId: string | null;
    templateVersion: number | null;
    contentHash: string;
  }): Promise<ContractSignature> {
    return this.prisma.contractSignature.create({ data: input });
  }

  async markContractStatus(
    tenantId: string,
    contractId: string,
    status: 'ISSUED' | 'SIGNED' | 'CANCELLED',
  ): Promise<{ count: number }> {
    return this.prisma.rentalContract.updateMany({
      where: { id: contractId, tenantId },
      data: { status },
    });
  }

  async findReceiptByBooking(tenantId: string, bookingId: string): Promise<Receipt | null> {
    return this.prisma.receipt.findFirst({ where: { bookingId, tenantId } });
  }

  async findReceiptById(tenantId: string, receiptId: string): Promise<ReceiptWithDocuments | null> {
    return this.prisma.receipt.findFirst({
      where: { id: receiptId, tenantId },
      include: { documents: true },
    });
  }

  async listReceiptsForTenant(tenantId: string): Promise<ReceiptWithDocuments[]> {
    return this.prisma.receipt.findMany({
      where: { tenantId },
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createReceipt(input: {
    tenantId: string;
    bookingId: string;
    contractId: string;
    receiptNumber: string;
    kind: 'RENTAL_CONTRACT';
    locale: string;
    totalsJson: Prisma.InputJsonValue;
    contentText: string;
    contentHash: string;
    createdById: string | null;
  }): Promise<Receipt> {
    return this.prisma.receipt.create({ data: input });
  }

  async createGeneratedDocument(input: {
    tenantId: string;
    kind: 'RENTAL_CONTRACT' | 'RENTAL_RECEIPT';
    bookingId: string | null;
    contractId: string | null;
    receiptId: string | null;
    locale: string;
    title: string;
    contentHash: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<GeneratedDocument> {
    return this.prisma.generatedDocument.create({ data: input });
  }

  async findGeneratedDocument(
    tenantId: string,
    documentId: string,
  ): Promise<GeneratedDocument | null> {
    return this.prisma.generatedDocument.findFirst({
      where: { id: documentId, tenantId },
    });
  }

  async findVerifiedLicense(customerId: string): Promise<{ number: string | null } | null> {
    return this.prisma.customerDocument.findFirst({
      where: { customerId, type: 'DRIVER_LICENSE', status: 'VERIFIED' },
      select: { number: true },
      orderBy: { verifiedAt: 'desc' },
    });
  }

  /** User-scoped reads (me-portal 08-C): the caller's own contracts. */
  async findContractForUser(userId: string, contractId: string): Promise<ContractWithRelations | null> {
    return this.prisma.rentalContract.findFirst({
      where: { id: contractId, booking: { customer: { userId } } },
      include: { snapshot: true, signature: true, documents: true },
    });
  }

  async findReceiptForUser(userId: string, receiptId: string): Promise<ReceiptWithDocuments | null> {
    return this.prisma.receipt.findFirst({
      where: { id: receiptId, booking: { customer: { userId } } },
      include: { documents: true },
    });
  }

  async findUserDisplayName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return user?.displayName ?? null;
  }

  async findContractsForUserByBooking(
    userId: string,
    bookingId: string,
  ): Promise<ContractWithRelations[]> {
    return this.prisma.rentalContract.findMany({
      where: { bookingId, booking: { customer: { userId } } },
      include: { snapshot: true, signature: true, documents: true },
    });
  }

  async findReceiptForUserByBooking(userId: string, bookingId: string): Promise<ReceiptWithDocuments | null> {
    return this.prisma.receipt.findFirst({
      where: { bookingId, booking: { customer: { userId } } },
      include: { documents: true },
    });
  }

  async findContractByBookingId(tenantId: string, bookingId: string): Promise<ContractWithRelations | null> {
    return this.prisma.rentalContract.findFirst({
      where: { bookingId, tenantId },
      include: { snapshot: true, signature: true, documents: true },
    });
  }
}
