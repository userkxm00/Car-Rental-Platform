-- PHASE-07 / 07-E05 (booking portal, customer information form):
-- re-target bookings.customerId from the platform user to the tenant's
-- customer record (architecture/customer-platform.md R1 decision). The
-- tenant scope of customers keeps cross-tenant identity out of bookings.
-- NULLs stay permitted (walk-in/import flows attach customers later) and
-- ON DELETE SET NULL is preserved.

ALTER TABLE "bookings" DROP CONSTRAINT "bookings_customerId_fkey";

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
