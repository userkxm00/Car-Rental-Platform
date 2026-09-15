import type { PrismaService } from '../../prisma/prisma.service';

export interface BookingFinanceContext {
  bookingNumber: string;
  tenantId: string;
  currency: string;
  status: string;
  snapshot: unknown;
}

/**
 * The one server-authoritative way to resolve a booking's financial
 * context for a user: the user must be an active member of the
 * booking's tenant, and the tenant/currency/status/snapshot all come
 * from the booking row and its immutable price snapshot — never from
 * client input. Shared by the payments (09-A) and billing (09-B)
 * repositories so their scoping semantics cannot drift.
 */
export async function findBookingFinanceContext(
  prisma: Pick<PrismaService, '$queryRaw'>,
  userId: string,
  bookingId: string,
): Promise<BookingFinanceContext | null> {
  const rows = await prisma.$queryRaw<
    {
      bookingNumber: string;
      tenantId: string;
      currency: string;
      status: string;
      pricingJson: unknown;
    }[]
  >`
    SELECT b."bookingNumber", b."tenantId", b."currency", b."status", s."pricingJson"
    FROM "bookings" b
    JOIN "memberships" m
      ON m."tenantId" = b."tenantId" AND m."userId" = ${userId}::uuid AND m."status" = 'ACTIVE'
    LEFT JOIN "booking_price_snapshots" s ON s."bookingId" = b."id"
    WHERE b."id" = ${bookingId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    bookingNumber: row.bookingNumber,
    tenantId: row.tenantId,
    currency: row.currency,
    status: row.status,
    snapshot: row.pricingJson,
  };
}
