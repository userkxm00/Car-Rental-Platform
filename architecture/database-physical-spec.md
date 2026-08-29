# Database Physical Specification — Pre-Implementation

## Status

Design baseline. Final SQL migrations are produced only after the domain/state-machine review is accepted.

## Selected database

PostgreSQL with PostGIS.

## Naming

- Lowercase snake_case for database identifiers.
- Singular or plural naming must be consistent; current convention is plural table names.
- Primary keys use UUIDs unless a domain-specific external identifier is explicitly required.
- Foreign keys use `<entity>_id`.
- Timestamp columns use `created_at`, `updated_at` and explicit event timestamps such as `occurred_at` where needed.

## Tenant ownership

Tenant-owned tables must have a direct `tenant_id` when it improves enforcement and query safety. A transitive path alone is not sufficient for high-risk or high-volume domains.

Examples:
- vehicles.tenant_id
- bookings.tenant_id
- payments.tenant_id
- customers.tenant_id

Platform-control-plane tables such as plans and feature flags are not tenant-owned.

## Money

Never use floating point types for financial amounts.

Recommended representation:
- `numeric`/decimal with explicit scale for stored amounts, or
- integer minor units only when currency rules are fully explicit.

Currency is stored with the amount where historical meaning matters.

## Time

- Store instants in UTC using PostgreSQL `timestamptz`.
- Store agency/branch timezone as an explicit configuration value.
- Date-only concepts use `date`.
- Opening-hour schedules are interpreted in the relevant location timezone.
- Never infer business dates from server local time.

## Statuses

Business status transitions should be represented as application/domain state machines and history records. Database enums may be used where stable and useful, but do not let an enum become the only historical audit mechanism.

## Historical truth

Mutable configuration must not rewrite historical facts.

Examples:
- booking price snapshot
- invoice totals
- signed contract version
- inspection facts
- payment transaction meaning

## Soft delete

Do not add `deleted_at` to every table by default. Use:
- archive status where records remain operationally visible;
- hard delete only where safe and policy permits;
- explicit retention workflows for personal data where legally required.

## Indexing principles

Indexes follow real access patterns.

Expected high-value indexes include combinations around:
- tenant + status
- tenant + branch
- tenant + created_at
- vehicle + time interval / operational records
- booking + customer
- booking + vehicle
- booking + pickup/drop-off location
- document + expiry date
- notification + recipient + unread state

Every production index must have a query/use-case reason.

## Geospatial model

Use PostGIS `geography(Point, 4326)` for most real-world latitude/longitude points where distance calculations are central.

Use appropriate `geometry` types when polygon/shape operations require them, such as:
- delivery zones
- service areas

Create spatial indexes with GiST where appropriate.

Canonical location data should include:
- semantic entity reference
- latitude/longitude geography or geometry
- structured address fields where practical
- localized display fields
- provider place ID as optional metadata

Provider-specific IDs must never become canonical identity.

## Delivery zones

A delivery zone can be represented as a polygon/multipolygon.

Core business query:

`Is pickup/drop-off point inside a zone?`

This should be evaluated by PostGIS and then combined with agency policy and pricing rules.

## Vehicle availability intervals

The final implementation may use PostgreSQL range types and exclusion constraints for overlapping intervals where the model permits it.

Candidate concept:
- `tstzrange(start_at, end_at, '[)')`
- exclusion constraint scoped by vehicle ID for mutually exclusive committed intervals

Exact constraints are finalized after the booking/availability design review.

## Concurrency

Critical writes use transactions. Availability and booking creation must remain correct under concurrent requests.

Idempotency keys are required for externally retried commands such as payment confirmation and selected booking mutations.

## JSON usage

Use relational columns for queryable business facts. `jsonb` is allowed for:
- provider payload snapshots
- flexible metadata
- versioned configuration payloads where schema is intentionally flexible

Do not hide core booking, financial, permission or tenant relationships inside opaque JSON.

## Files

PostgreSQL stores metadata and ownership references. Binary content is stored in private object storage.

## Migration policy

- Every schema change is a committed migration.
- Migrations must be forward-deployable and reviewed.
- Destructive changes require a staged migration plan.
- Seed data is separated from migration structure.
- Production migrations are never edited after execution; create a new migration for corrections.

## Definition of ready for migrations

Physical schema is ready only after:
1. business rules accepted;
2. booking/availability/pricing state machines accepted;
3. tenant/auth model accepted;
4. access patterns identified;
5. constraints and indexes reviewed;
6. backup/recovery plan defined;
7. migration/rollback strategy reviewed.
