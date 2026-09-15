import { Injectable } from '@nestjs/common';
import type { LedgerWrite } from '../domain/billing.rules';
import { BillingRepository } from '../infrastructure/billing.repository';

/**
 * The single write path into the append-only booking ledger (09-B06).
 * Consumers — the 09-A payment confirmations/voids, the deposit hold
 * lifecycle and invoice issuance — append rows here; nothing ever
 * updates or deletes a row, so the ledger is an auditable financial
 * event log (docs/06).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly repository: BillingRepository) {}

  append(tenantId: string, bookingId: string, write: LedgerWrite, actorUserId: string | null): Promise<void> {
    return this.repository.appendLedger(tenantId, bookingId, write, actorUserId);
  }
}
