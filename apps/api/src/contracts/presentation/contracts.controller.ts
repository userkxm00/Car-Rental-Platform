import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUserId, PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { Permission } from '../../authorization/permissions';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { RateLimit, RateLimitGuard } from '../../security/rate-limit/rate-limit.guard';
import type {
  ContractDownloadResponse,
  ContractIssuanceInput,
  ContractListResponse,
  ContractResponse,
  ContractSignatureInput,
  DocumentAccessHistoryResponse,
  ReceiptListResponse,
  ReceiptResponse,
} from '../domain/contracts.contract';
import { ContractsService } from '../application/contracts.service';

/**
 * PHASE-08 / 08-C staff surface: rental contracts (08-C01/08-C02),
 * signatures (08-C03), receipts (08-C05) and generated document
 * downloads (08-C06).
 *
 * Every route is agency-scoped and permission-guarded. Contract/receipt
 * generation requires the committed booking price snapshot and refuses
 * missing parties/vehicle/branch/contact data — the server assembles
 * every value, clients never supply contract content.
 */
@Controller('agencies/:agencyId')
@UseGuards(RateLimitGuard)
@RateLimit({ windowMs: 60_000, max: 120 })
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  // ── contracts ──────────────────────────────────────────────────────────────

  @Post('bookings/:bookingId/contracts')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async issueContract(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
    @Body() body: ContractIssuanceInput,
  ): Promise<ContractResponse> {
    return this.service.issueContract(agencyId, bookingId, userId, body ?? {});
  }

  @Get('bookings/:bookingId/contracts')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async listBookingContracts(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<ContractListResponse> {
    return this.service.listContracts(agencyId, bookingId);
  }

  @Get('contracts/:contractId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async getContract(
    @Param('agencyId') agencyId: string,
    @Param('contractId') contractId: string,
  ): Promise<ContractResponse> {
    return this.service.getContract(agencyId, contractId);
  }

  @Post('contracts/:contractId/signature')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async signContract(
    @Param('agencyId') agencyId: string,
    @Param('contractId') contractId: string,
    @AuthUserId() userId: string,
    @Body() body: ContractSignatureInput,
  ): Promise<ContractResponse> {
    return this.service.signContract(agencyId, contractId, userId, body ?? {});
  }

  // ── receipts ───────────────────────────────────────────────────────────────

  @Post('bookings/:bookingId/receipts')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async generateReceipt(
    @Param('agencyId') agencyId: string,
    @Param('bookingId') bookingId: string,
    @AuthUserId() userId: string,
  ): Promise<ReceiptResponse> {
    return this.service.generateReceipt(agencyId, bookingId, userId);
  }

  @Get('receipts')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async listReceipts(@Param('agencyId') agencyId: string): Promise<ReceiptListResponse> {
    return this.service.listReceipts(agencyId);
  }

  @Get('receipts/:receiptId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async getReceipt(
    @Param('agencyId') agencyId: string,
    @Param('receiptId') receiptId: string,
  ): Promise<ReceiptResponse> {
    return this.service.getReceipt(agencyId, receiptId);
  }

  // ── generated documents (08-C06) + secure lifecycle (08-D) ─────────────────

  @Get('documents/:documentId/url')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async downloadDocument(
    @Param('agencyId') agencyId: string,
    @Param('documentId') documentId: string,
    @AuthUserId() userId: string,
  ): Promise<ContractDownloadResponse> {
    return this.service.downloadDocument(agencyId, documentId, userId);
  }

  /** 08-D03: the append-only access trail for one generated document. */
  @Get('documents/:documentId/access-history')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_READ)
  async documentAccessHistory(
    @Param('agencyId') agencyId: string,
    @Param('documentId') documentId: string,
  ): Promise<DocumentAccessHistoryResponse> {
    return this.service.listDocumentAccessHistory(agencyId, documentId);
  }

  /** 08-D05: stop further signed-URL issuance; the historical row stays. */
  @Post('documents/:documentId/revoke')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async revokeDocument(
    @Param('agencyId') agencyId: string,
    @Param('documentId') documentId: string,
    @AuthUserId() userId: string,
  ): Promise<ContractDownloadResponse> {
    return this.service.revokeDocument(agencyId, documentId, userId);
  }

  /** 08-D05: re-enable signed-URL issuance (audited). */
  @Post('documents/:documentId/restore')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CONTRACT_MANAGE)
  async restoreDocument(
    @Param('agencyId') agencyId: string,
    @Param('documentId') documentId: string,
    @AuthUserId() userId: string,
  ): Promise<ContractDownloadResponse> {
    return this.service.restoreDocument(agencyId, documentId, userId);
  }
}
