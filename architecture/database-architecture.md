# Database Architecture

## Selected database

**PostgreSQL 18.x + PostGIS**.

PostgreSQL stores durable relational business truth. PostGIS adds spatial storage/indexing/query capability.

## Data modeling principles

- UUIDs/ULIDs must use one documented project-wide strategy.
- Every tenant-owned table must have an explicit tenant ownership path.
- Use foreign keys and unique constraints for integrity.
- Use timestamps consistently; store canonical timestamps in UTC and localize at presentation time.
- Use numeric/decimal types for money; never floating point for financial amounts.
- Prefer append-only records for payments, audit events and state histories.
- Preserve historical snapshots where current configuration cannot reconstruct past truth.

## Conceptual schema

```text
platform_users
agencies
subscriptions
plans
entitlements
license_keys

agencies ──< branches
agencies ──< staff_memberships
agencies ──< customers
agencies ──< vehicles
branches ──< vehicles
vehicle_categories ──< vehicles

vehicles ──< vehicle_documents
vehicles ──< vehicle_expenses
vehicles ──< operational_blocks
vehicles ──< maintenance_records
vehicles ──< inspections

customers ──< quotes
customers ──< bookings
bookings ──< booking_items
bookings ──< payments
bookings ──< inspections
bookings ──< notifications
bookings ──< status_history
```

## Tenancy strategy

Every query for tenant-owned data must be scoped by authenticated tenant context.

Prefer repository/service APIs that require tenant context rather than allowing arbitrary tenant IDs from clients.

Evaluate PostgreSQL Row Level Security as defense-in-depth after the application authorization model is stable.

## Money model

Store:
- integer minor units where practical, or numeric/decimal with an explicit scale
- currency code on every monetary aggregate requiring historical interpretation
- immutable snapshot values on confirmed bookings/invoices

Never calculate historical revenue using today's prices.

## Booking conflict integrity

Vehicle reservations are time intervals. The final implementation should use PostgreSQL capabilities to strengthen overlap prevention, potentially including range types and exclusion constraints where the chosen schema permits them.

Application-level conflict checks remain necessary for business rules; database constraints provide an additional correctness barrier.

## Geospatial model

Store branch/pickup/delivery geometries using PostGIS geography/geometry types selected per query requirements.

Recommended separate fields/concepts:
- normalized address text
- country/wilaya/city identifiers
- latitude/longitude presentation fields only when useful
- canonical PostGIS point/polygon
- provider place ID as optional integration metadata

Spatial indexes must be created for high-volume spatial queries.

## PostGIS and Prisma

Prisma remains primary for ordinary relational CRUD and migrations. PostGIS-specific fields/queries use the documented SQL adapter boundary because unsupported geographic types may need raw SQL. Keep raw SQL narrow, parameterized and protected by tests.

## File metadata

PostgreSQL stores metadata such as:
- owner/tenant
- file purpose
- object key
- MIME type
- size
- checksum
- created_at

Binary content belongs in object storage.

## Indexing baseline

Indexes should be driven by access patterns. Expected high-value indexes include:
- tenant + created_at on frequently listed resources
- vehicle + rental interval/search keys
- branch + operational status
- booking customer references
- notification recipient + unread/status
- document expiry dates
- PostGIS spatial indexes on branch/pickup/delivery geometry

Do not create indexes indiscriminately; verify with query plans as data grows.

## Migration policy

- Every schema change is a reviewed migration.
- Migrations are committed to Git.
- Destructive migrations require explicit migration planning.
- Production migration rehearsal is required before release.
- Seed/demo data must be clearly separated from production data.

## Backup/recovery

Production must define and test:
- backup schedule
- retention
- RPO
- RTO
- restore procedure
- access controls
- disaster recovery procedure
