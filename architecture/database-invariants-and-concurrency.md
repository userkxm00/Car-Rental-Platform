# Database Invariants & Concurrency Rules

Status: design baseline for implementation.

## Purpose

The application layer is necessary but not sufficient for critical invariants. PostgreSQL must protect the highest-value correctness properties wherever practical.

## 1. Tenant isolation

### Rule
No tenant-owned record may be read, changed, exported or linked across agencies unless the actor has explicit platform-level authorization.

### Implementation guidance
- Derive tenant scope from authenticated membership on the server.
- Do not trust a tenant_id submitted by clients.
- Prefer tenant-scoped repository/service methods.
- Use composite tenant-aware unique constraints where they encode real business uniqueness.
- Consider PostgreSQL Row-Level Security only after the transaction/auth architecture is proven; RLS is a defense-in-depth option, not a substitute for application authorization.

## 2. Booking overlap protection

### Rule
A vehicle cannot have incompatible rental/hold commitments that overlap in time.

### Required approach
The availability service performs business validation, then the final write is protected by a transaction/concurrency mechanism so two simultaneous requests cannot both consume the same inventory.

For vehicle-specific rentals, prefer a PostgreSQL range-based model where a canonical rental/reservation interval can be indexed and protected with an exclusion constraint for incompatible active states.

Conceptual form:

```text
vehicle_id + rental_time_range + excluded active statuses
```

The exact SQL must be validated during implementation because status-aware partial exclusion constraints and lifecycle transitions require careful modeling.

### Boundary rule
Use one interval convention everywhere. Recommended:

```text
[start, end)
```

This avoids treating a return at 18:00 and a new pickup at 18:00 as an automatic overlap. Operational buffers may extend availability separately.

## 3. Temporary booking holds

A hold must have an explicit expiration timestamp.

Rules:
- expired holds do not block inventory after their effective expiry
- confirmation must re-check inventory
- retries must be idempotent
- multiple hold creation requests must not accidentally multiply the hold

## 4. Category-based inventory

Category bookings do not reserve a particular vehicle until assignment unless agency policy says otherwise.

The availability algorithm must count eligible vehicles and already-consumed commitments for the relevant interval.

A category booking cannot be confirmed if available eligible capacity is exhausted.

## 5. Money

Never use binary floating point for authoritative amounts.

Preferred physical representation:
- integer minor units for currencies where fixed minor units are sufficient, or
- PostgreSQL NUMERIC with explicit scale/precision when business requirements demand decimal quantities.

The choice must be consistent inside the domain.

Currency code is stored with the financial context. Do not infer currency from locale.

## 6. Time and timezone

Authoritative event timestamps are stored in UTC using PostgreSQL timestamptz semantics.

Business-local schedules also retain the applicable tenant/branch timezone context.

Date-only concepts (e.g. document expiry date) must use DATE rather than midnight timestamps.

Pickup/return time rules must not be represented as arbitrary localized strings.

## 7. IDs and public identifiers

Internal primary keys use UUIDs.

Human-friendly booking numbers are separate from UUIDs, unique within the applicable tenant/business scope.

Public-facing opaque IDs may be separate where exposing sequential identifiers creates enumeration risk.

## 8. Audit/history immutability

Append-oriented records include:
- booking status history
- payments/refunds/adjustments
- meter readings
- inspections/evidence
- subscription events
- license activation events
- important audit events

Do not rewrite historical rows merely to make the current screen easier to render.

## 9. Unique constraints

Every unique constraint must answer a real business question.

Examples:
- tenant + branch code
- tenant + vehicle plate
- tenant + booking number
- tenant + user membership

Avoid global uniqueness for fields that only need to be unique inside one agency.

## 10. Referential integrity

Use foreign keys for ownership and dependent relationships unless a deliberate lifecycle/archival design requires otherwise.

Avoid orphaned:
- bookings
- payment allocations
- contracts
- inspections
- damage evidence
- agency memberships

Deletion behavior must be explicit; destructive cascades are not a safe default for historical domains.

## 11. Status versus deletion

Operational entities normally use status/state transitions rather than physical deletion.

Historical financial and rental facts should remain queryable according to retention rules.

Personal documents may have separate retention/deletion requirements; those policies must be specified before production.

## 12. JSONB usage

JSONB is allowed for genuinely flexible metadata/configuration where schema stability is valuable.

Do not put core relational business state (booking status, tenant ownership, monetary totals, vehicle identity) into opaque JSON blobs.

## 13. Index strategy

Indexes must follow measured access patterns.

Expected high-value indexes include combinations around:
- tenant_id
- branch/location IDs
- booking time ranges/status
- vehicle assignment
- customer search identifiers
- payment reconciliation IDs
- document expiry dates
- marketplace published/active status
- spatial columns using PostGIS GIST/SP-GIST as appropriate

Do not create indexes blindly on every column.

## 14. Transactions

Transactions are required around workflows that change multiple authoritative records together.

Examples:
- confirm booking + consume inventory + snapshot price
- pickup + create rental session + inspection
- return + inspection + block/readiness + settlement
- payment reconciliation + allocation
- license activation + entitlement grant

Transaction boundaries should be short and explicit.

## 15. Idempotency

Public mutation endpoints that may be retried by browsers, mobile clients or providers should support idempotency where duplicate effects would be harmful.

Candidate operations:
- booking creation
- booking confirmation
- payment initiation
- webhook processing
- license activation
- manual financial posting

## 16. Provider webhook safety

Store provider event IDs and process each event idempotently.

Never trust the client app to report a successful payment.

A payment state becomes authoritative only through verified provider evidence or controlled manual reconciliation.

## 17. Media access

The database stores metadata and authorization context for media objects.

Actual binary files live in object storage.

Private documents must use authorized access, typically through short-lived signed URLs or server-mediated streaming depending on the use case.

## 18. Marketplace data boundaries

Public search may expose:
- agency public profile
- published vehicle/listing data
- public location information
- public pricing/availability offers
- verified review summary

It must not expose by default:
- internal customer information
- staff data
- internal notes
- financial ledgers
- exact live vehicle/customer tracking
- private documents

## 19. Review integrity

A review should be uniquely or logically linked to an eligible completed rental experience according to policy.

Repeated review creation for the same experience must be prevented.

Moderation changes should be auditable rather than silently deleting the history.

## 20. Migration discipline

Schema changes are versioned migrations.

Before production:
- migration tested against a realistic dataset
- long-running/index-building risks reviewed
- backward compatibility checked for rolling deployments
- rollback or forward-fix strategy documented

## 21. Production defense layers

Critical invariants should be protected in multiple layers:

```text
Client validation
      ↓
API validation
      ↓
Domain policy
      ↓
Transaction
      ↓
Database constraints/indexes
```

No single UI check is considered sufficient for correctness or security.
