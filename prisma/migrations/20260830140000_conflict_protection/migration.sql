CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "vehicle_blocks" ADD COLUMN "period" tstzrange GENERATED ALWAYS AS (tstzrange(("startsAt" AT TIME ZONE 'UTC'), ("endsAt" AT TIME ZONE 'UTC'), '[)')) STORED;

ALTER TABLE "booking_holds" ADD COLUMN "period" tstzrange GENERATED ALWAYS AS (tstzrange(("startsAt" AT TIME ZONE 'UTC'), ("endsAt" AT TIME ZONE 'UTC'), '[)')) STORED;

ALTER TABLE "vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_no_overlap" EXCLUDE USING gist ("vehicleId" WITH =, "period" WITH &&) WHERE ("status" IN ('SCHEDULED', 'ACTIVE'));

ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_no_overlap" EXCLUDE USING gist ("vehicleId" WITH =, "period" WITH &&) WHERE ("status" = 'ACTIVE');
