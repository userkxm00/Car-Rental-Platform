-- PHASE-06 / 06-D08: one immutable price snapshot per confirmed booking.
-- Captured once at confirmation and never rewritten; the unique constraint
-- backs the immutability guarantee at the storage layer.
CREATE UNIQUE INDEX "booking_price_snapshots_bookingId_key" ON "booking_price_snapshots"("bookingId");
