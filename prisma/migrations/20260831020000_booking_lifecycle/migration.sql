-- 05-D: lifecycle operations — extension requests (05-D05/D06),
-- cancellation records (05-D01/D02), vehicle assignment history (05-D07)
-- and idempotency records for retry-safe commands (05-D09).

CREATE TYPE "BookingExtensionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

CREATE TYPE "BookingCancellationInitiator" AS ENUM ('CUSTOMER', 'AGENCY');

CREATE TABLE "booking_extensions" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "requestedEndsAt" TIMESTAMP(3) NOT NULL,
    "originalEndsAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingExtensionStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedBy" UUID,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "pricingJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_extensions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_cancellations" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "initiator" "BookingCancellationInitiator" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" UUID,
    "policyVersion" TEXT,
    "financialResultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_cancellations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_assignments" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "fromVehicleId" UUID,
    "toVehicleId" UUID NOT NULL,
    "reason" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_idempotency_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "command" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "bookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booking_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "booking_extensions_bookingId_createdAt_idx" ON "booking_extensions"("bookingId", "createdAt");
CREATE INDEX "booking_cancellations_bookingId_idx" ON "booking_cancellations"("bookingId");
CREATE INDEX "booking_assignments_bookingId_createdAt_idx" ON "booking_assignments"("bookingId", "createdAt");
CREATE UNIQUE INDEX "booking_idempotency_records_tenantId_actorUserId_command_idempotencyKey_key" ON "booking_idempotency_records"("tenantId", "actorUserId", "command", "idempotencyKey");

ALTER TABLE "booking_extensions" ADD CONSTRAINT "booking_extensions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_cancellations" ADD CONSTRAINT "booking_cancellations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_idempotency_records" ADD CONSTRAINT "booking_idempotency_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_idempotency_records" ADD CONSTRAINT "booking_idempotency_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
