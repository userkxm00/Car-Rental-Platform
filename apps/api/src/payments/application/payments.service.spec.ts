import type { HttpException } from '@nestjs/common';
import type { DepositHold, PaymentIntent, PaymentRecord } from '@prisma/client';
import { PaymentsService } from './payments.service';
import {
  PaymentsRepository,
  type BookingFinanceContext,
} from '../infrastructure/payments.repository';
import { PaymentsErrorCode } from '../domain/payment-rules';

/** PHASE-09 / 09-A service orchestration over mocked persistence. */

const bookingFinance = (overrides: Partial<BookingFinanceContext> = {}): BookingFinanceContext => ({
  id: 'b1',
  status: 'CONFIRMED',
  currency: 'DZD',
  priceSnapshots: [
    { pricingJson: { currency: 'DZD', totalMinor: 45000, depositMinor: 10000 } },
  ],
  ...overrides,
});

const intentRow = (overrides: Partial<PaymentIntent> = {}): PaymentIntent => ({
  id: 'int1',
  tenantId: 't1',
  bookingId: 'b1',
  currency: 'DZD',
  totalMinor: 45000,
  depositMinor: 10000,
  status: 'OPEN',
  createdAt: new Date('2026-09-04T00:00:00Z'),
  updatedAt: new Date('2026-09-04T00:00:00Z'),
  ...overrides,
});

const recordRow = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: 'rec1',
  tenantId: 't1',
  intentId: 'int1',
  method: 'CASH',
  amountMinor: 20000,
  reference: null,
  note: null,
  status: 'PENDING_CONFIRMATION',
  recordedById: 'u-staff',
  confirmedById: null,
  confirmedAt: null,
  createdAt: new Date('2026-09-04T10:00:00Z'),
  ...overrides,
});

const holdRow = (overrides: Partial<DepositHold> = {}): DepositHold => ({
  id: 'hold1',
  tenantId: 't1',
  intentId: 'int1',
  bookingId: 'b1',
  amountMinor: 10000,
  status: 'HELD',
  releasedById: null,
  releasedAt: null,
  note: null,
  createdAt: new Date('2026-09-04T00:00:00Z'),
  updatedAt: new Date('2026-09-04T00:00:00Z'),
  ...overrides,
});

/** Extract the Nest error code carried in getResponse(). */
async function codeOf(this: void, promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const response = (error as HttpException).getResponse();
    return (response as { code?: string })?.code ?? '';
  }
  throw new Error('expected the promise to reject');
}

interface Mocks {
  findBookingFinanceContext: jest.Mock;
  findBookingFinanceContextForUser: jest.Mock;
  findIntentByBooking: jest.Mock;
  findIntentWithRelations: jest.Mock;
  createIntent: jest.Mock;
  createDepositHold: jest.Mock;
  createRecord: jest.Mock;
  findRecord: jest.Mock;
  confirmRecordWithinOutstanding: jest.Mock;
  voidRecord: jest.Mock;
  findDepositHoldByBooking: jest.Mock;
  releaseDepositHold: jest.Mock;
  confirmedMinorForIntent: jest.Mock;
}

function buildMocks(): Mocks {
  return {
    findBookingFinanceContext: jest.fn(),
    findBookingFinanceContextForUser: jest.fn(),
    findIntentByBooking: jest.fn(),
    findIntentWithRelations: jest.fn(),
    createIntent: jest.fn(),
    createDepositHold: jest.fn(),
    createRecord: jest.fn(),
    findRecord: jest.fn(),
    confirmRecordWithinOutstanding: jest.fn(),
    voidRecord: jest.fn(),
    findDepositHoldByBooking: jest.fn(),
    releaseDepositHold: jest.fn(),
    confirmedMinorForIntent: jest.fn(),
  };
}

function wireMocks(mocks: Mocks): { service: PaymentsService } {
  const repository = {
    findBookingFinanceContext: mocks.findBookingFinanceContext,
    findBookingFinanceContextForUser: mocks.findBookingFinanceContextForUser,
    findIntentByBooking: mocks.findIntentByBooking,
    findIntentWithRelations: mocks.findIntentWithRelations,
    createIntent: mocks.createIntent,
    createDepositHold: mocks.createDepositHold,
    createRecord: mocks.createRecord,
    findRecord: mocks.findRecord,
    confirmRecordWithinOutstanding: mocks.confirmRecordWithinOutstanding,
    voidRecord: mocks.voidRecord,
    findDepositHoldByBooking: mocks.findDepositHoldByBooking,
    releaseDepositHold: mocks.releaseDepositHold,
    confirmedMinorForIntent: mocks.confirmedMinorForIntent,
  } as unknown as PaymentsRepository;
  return { service: new PaymentsService(repository) };
}

describe('PaymentsService (09-A)', () => {
  describe('payment intent (09-A01/09-A04)', () => {
    it('creates the intent lazily from the immutable price snapshot', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(null);
      mocks.findBookingFinanceContext.mockResolvedValue(bookingFinance());
      mocks.createIntent.mockResolvedValue(intentRow());
      mocks.createDepositHold.mockResolvedValue(holdRow());
      mocks.findIntentWithRelations.mockResolvedValue({
        ...intentRow(),
        records: [],
        depositHold: holdRow(),
      });

      const summary = await service.getBookingPayments('t1', 'b1');

      expect(mocks.createIntent).toHaveBeenCalledWith({
        tenantId: 't1',
        bookingId: 'b1',
        currency: 'DZD',
        totalMinor: 45000,
        depositMinor: 10000,
      });
      expect(summary.status).toBe('OPEN');
      expect(summary.totalMinor).toBe(45000);
      expect(summary.depositMinor).toBe(10000);
      expect(summary.paidMinor).toBe(0);
      expect(summary.outstandingMinor).toBe(45000);
      expect(summary.depositHold?.amountMinor).toBe(10000);
    });

    it('skips the deposit hold when the snapshot carries no deposit', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(null);
      mocks.findBookingFinanceContext.mockResolvedValue(
        bookingFinance({ priceSnapshots: [{ pricingJson: { currency: 'DZD', totalMinor: 45000, depositMinor: 0 } }] }),
      );
      mocks.createIntent.mockResolvedValue(intentRow({ depositMinor: 0 }));
      mocks.findIntentWithRelations.mockResolvedValue({
        ...intentRow({ depositMinor: 0 }),
        records: [],
        depositHold: null,
      });

      const summary = await service.getBookingPayments('t1', 'b1');

      expect(mocks.createDepositHold).not.toHaveBeenCalled();
      expect(summary.depositHold).toBeNull();
    });

    it('refuses draft, pending and cancelled bookings', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(null);
      mocks.findBookingFinanceContext.mockResolvedValue(bookingFinance({ status: 'CANCELLED' }));
      expect(await codeOf(service.getBookingPayments('t1', 'b1'))).toBe(
        PaymentsErrorCode.PAYMENT_BOOKING_NOT_ELIGIBLE,
      );
    });

    it('404s unknown bookings and refuses missing snapshots', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(null);
      mocks.findBookingFinanceContext.mockResolvedValue(null);
      expect(await codeOf(service.getBookingPayments('t1', 'b1'))).toBe(
        PaymentsErrorCode.PAYMENT_BOOKING_NOT_FOUND,
      );

      mocks.findBookingFinanceContext.mockResolvedValue(
        bookingFinance({ priceSnapshots: [{ pricingJson: { currency: 'DZD' } }] }),
      );
      expect(await codeOf(service.getBookingPayments('t1', 'b1'))).toBe(
        PaymentsErrorCode.PAYMENT_PRICING_MISSING,
      );
    });

    it('projects the balance from confirmed records only', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      mocks.findIntentWithRelations.mockResolvedValue({
        ...intentRow(),
        records: [
          recordRow({ id: 'r1', status: 'CONFIRMED', amountMinor: 20000, confirmedAt: new Date() }),
          recordRow({ id: 'r2', status: 'PENDING_CONFIRMATION', amountMinor: 25000 }),
        ],
        depositHold: holdRow(),
      });

      const summary = await service.getBookingPayments('t1', 'b1');

      expect(summary.status).toBe('PARTIALLY_SETTLED');
      expect(summary.paidMinor).toBe(20000);
      expect(summary.outstandingMinor).toBe(25000);
    });
  });

  describe('payment records (09-A02/09-A03/09-A05/09-A08)', () => {
    it('records a manual payment as pending confirmation', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      mocks.confirmedMinorForIntent.mockResolvedValue(0);
      mocks.createRecord.mockResolvedValue(recordRow());

      const response = await service.recordPayment('t1', 'b1', 'u-staff', {
        method: 'CASH',
        amountMinor: 20000,
        note: 'counter',
      });

      expect(mocks.createRecord).toHaveBeenCalledWith({
        tenantId: 't1',
        intentId: 'int1',
        method: 'CASH',
        amountMinor: 20000,
        reference: null,
        note: 'counter',
        recordedById: 'u-staff',
      });
      expect(response.status).toBe('PENDING_CONFIRMATION');
      expect(response.amountMinor).toBe(20000);
    });

    it('rejects invalid records and over-outstanding amounts', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      expect(await codeOf(service.recordPayment('t1', 'b1', 'u-staff', { method: 'CASH' }))).toBe(
        PaymentsErrorCode.PAYMENT_RECORD_INPUT_INVALID,
      );
      expect(
        await codeOf(
          service.recordPayment('t1', 'b1', 'u-staff', { method: 'BANK_TRANSFER', amountMinor: 1000 }),
        ),
      ).toBe(PaymentsErrorCode.PAYMENT_RECORD_INPUT_INVALID);

      mocks.confirmedMinorForIntent.mockResolvedValue(40000);
      expect(
        await codeOf(service.recordPayment('t1', 'b1', 'u-staff', { method: 'CASH', amountMinor: 10000 })),
      ).toBe(PaymentsErrorCode.PAYMENT_EXCEEDS_OUTSTANDING);
    });

    it('confirms pending records and surfaces the recomputed state', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      mocks.confirmRecordWithinOutstanding.mockResolvedValue('OK');
      mocks.findRecord.mockResolvedValue(
        recordRow({ status: 'CONFIRMED', confirmedById: 'u-admin', confirmedAt: new Date('2026-09-04T11:00:00Z') }),
      );

      const response = await service.confirmRecord('t1', 'b1', 'rec1', 'u-admin');

      expect(mocks.confirmRecordWithinOutstanding).toHaveBeenCalledWith('t1', 'int1', 'rec1', 'u-admin');
      expect(response.status).toBe('CONFIRMED');
      expect(response.confirmedById).toBe('u-admin');
    });

    it('maps the atomic-gate outcomes to 409/404 errors', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());

      mocks.confirmRecordWithinOutstanding.mockResolvedValue('NOT_FOUND');
      expect(await codeOf(service.confirmRecord('t1', 'b1', 'rec1', 'u-admin'))).toBe(
        PaymentsErrorCode.PAYMENT_RECORD_NOT_FOUND,
      );
      mocks.confirmRecordWithinOutstanding.mockResolvedValue('STATE');
      expect(await codeOf(service.confirmRecord('t1', 'b1', 'rec1', 'u-admin'))).toBe(
        PaymentsErrorCode.PAYMENT_RECORD_STATE,
      );
      mocks.confirmRecordWithinOutstanding.mockResolvedValue('EXCEEDS');
      expect(await codeOf(service.confirmRecord('t1', 'b1', 'rec1', 'u-admin'))).toBe(
        PaymentsErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
      );
    });

    it('voids only pending records and never confirmed money', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      mocks.findRecord.mockResolvedValue(recordRow());
      mocks.voidRecord.mockResolvedValue(recordRow({ status: 'VOIDED' }));

      const response = await service.voidRecord('t1', 'b1', 'rec1');

      expect(response.status).toBe('VOIDED');
      expect(mocks.voidRecord).toHaveBeenCalledWith('rec1');

      mocks.findRecord.mockResolvedValue(recordRow({ status: 'CONFIRMED' }));
      expect(await codeOf(service.voidRecord('t1', 'b1', 'rec1'))).toBe(
        PaymentsErrorCode.PAYMENT_RECORD_STATE,
      );
    });

    it('hides records that belong to another booking intent', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      mocks.findRecord.mockResolvedValue(recordRow({ intentId: 'other-intent' }));
      expect(await codeOf(service.voidRecord('t1', 'b1', 'rec1'))).toBe(
        PaymentsErrorCode.PAYMENT_RECORD_NOT_FOUND,
      );
    });
  });

  describe('deposit lifecycle (09-A06)', () => {
    it('releases the hold after the rental returns', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findBookingFinanceContext.mockResolvedValue(bookingFinance({ status: 'RETURNED' }));
      mocks.findDepositHoldByBooking.mockResolvedValue(holdRow());
      mocks.releaseDepositHold.mockResolvedValue(
        holdRow({ status: 'RELEASED', releasedById: 'u-admin', releasedAt: new Date('2026-09-04T12:00:00Z'), note: 'ok' }),
      );

      const response = await service.releaseDeposit('t1', 'b1', 'u-admin', 'ok');

      expect(mocks.releaseDepositHold).toHaveBeenCalledWith('hold1', 'u-admin', 'ok', expect.any(Date) as never);
      expect(response.status).toBe('RELEASED');
      expect(response.releasedById).toBe('u-admin');
    });

    it('guards state, eligibility and missing holds', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);

      mocks.findBookingFinanceContext.mockResolvedValue(bookingFinance({ status: 'ACTIVE' }));
      expect(await codeOf(service.releaseDeposit('t1', 'b1', 'u-admin', null))).toBe(
        PaymentsErrorCode.PAYMENT_DEPOSIT_NOT_RELEASABLE,
      );

      mocks.findBookingFinanceContext.mockResolvedValue(bookingFinance({ status: 'RETURNED' }));
      mocks.findDepositHoldByBooking.mockResolvedValue(null);
      expect(await codeOf(service.releaseDeposit('t1', 'b1', 'u-admin', null))).toBe(
        PaymentsErrorCode.PAYMENT_DEPOSIT_MISSING,
      );

      mocks.findDepositHoldByBooking.mockResolvedValue(holdRow({ status: 'REFUNDED' }));
      expect(await codeOf(service.releaseDeposit('t1', 'b1', 'u-admin', null))).toBe(
        PaymentsErrorCode.PAYMENT_DEPOSIT_STATE,
      );
    });
  });

  describe('me-portal (09-A04)', () => {
    it('serves own bookings only', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findBookingFinanceContextForUser.mockResolvedValue(null);
      expect(await codeOf(service.getBookingPaymentsForUser('u-other', 'b1'))).toBe(
        PaymentsErrorCode.PAYMENT_BOOKING_NOT_FOUND,
      );
    });

    it('resolves the intent through the customer booking', async () => {
      const mocks = buildMocks();
      const { service } = wireMocks(mocks);
      mocks.findBookingFinanceContextForUser.mockResolvedValue({ ...bookingFinance(), tenantId: 't1' });
      mocks.findIntentByBooking.mockResolvedValue(intentRow());
      mocks.findIntentWithRelations.mockResolvedValue({
        ...intentRow(),
        records: [],
        depositHold: null,
      });

      const summary = await service.getBookingPaymentsForUser('u1', 'b1');

      expect(summary.bookingId).toBe('b1');
      expect(summary.records).toEqual([]);
    });
  });
});
