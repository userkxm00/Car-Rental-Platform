# 35 — Database & Backend Foundations

## Purpose

This document explains the database and backend foundation in simple terms and defines the recommended production architecture for the Car Rental Platform.

It is both a learning reference for the project owner and an engineering reference for agents.

---

## 1. PostgreSQL — what it is

PostgreSQL (Postgres) is the relational database management system that stores the application's durable business data.

Think of it as the actual database engine:

```text
Application
    ↓
Backend API
    ↓
PostgreSQL
    ↓
Tables / indexes / constraints / transactions
```

PostgreSQL is free and open source under the PostgreSQL License, a permissive license suitable for commercial software.

Official sources:
- https://www.postgresql.org/
- https://www.postgresql.org/download/
- https://www.postgresql.org/about/licence/

---

## 2. PostGIS — what it is

PostGIS is an open-source extension for PostgreSQL that adds geospatial storage, indexing, and spatial queries.

It allows the database to understand things such as:
- points
- lines
- polygons
- distances
- areas
- intersections
- nearby searches
- geographic boundaries

Official source:
- https://postgis.net/

For this product, PostGIS is important because maps are a first-class feature rather than decorative UI.

Examples:
- find branches near a customer
- find pickup points within a radius
- test whether a delivery address is inside a service zone
- calculate distance-based delivery fees
- query vehicles/branches by geographic area
- store branch, parking and pickup coordinates correctly

Conceptually:

```text
PostgreSQL
   +
PostGIS extension
   =
Transactional relational data + geographic intelligence
```

---

## 3. Supabase — what it is and is not

Supabase is not a replacement database technology for PostgreSQL.

Supabase provides a hosted development platform built around PostgreSQL plus additional services and tooling.

A useful mental model is:

```text
PostgreSQL = database engine
PostGIS    = PostgreSQL geospatial extension
Supabase   = hosted platform around Postgres + additional services
```

Supabase can therefore be used while still learning and using standard PostgreSQL concepts.

Current platform note:
- Supabase Free projects can be paused after about one week of low activity.
- Paid projects are not subject to that inactivity pausing.
- Free and paid plans have different backup, compute, storage and quota behavior.

These policies and prices can change and must be checked again before production decisions.

Official sources:
- https://supabase.com/
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing

---

## 4. Recommended production philosophy

Do not confuse "professional" with "self-host everything".

Professional production systems commonly use a managed PostgreSQL service because database operations include much more than installing the database:
- backups
- point-in-time recovery where available
- monitoring
- replication/high availability where required
- upgrades
- connection management
- security
- operational support

For this project, the application should be designed against standard PostgreSQL rather than being deeply coupled to one provider.

Recommended approach:

```text
                    Production SaaS
                          │
                    Managed PostgreSQL
                          │
                    PostgreSQL + PostGIS
                          │
                   Prisma data access
```

Supabase is an acceptable managed PostgreSQL provider for early production when its plan, backups, region, operational requirements and costs fit the product.

The architecture must remain portable enough to migrate to another PostgreSQL host later without rewriting the domain model.

Possible future managed PostgreSQL providers include other cloud/database providers. The exact production provider is an infrastructure decision and must be recorded in an ADR after evaluating cost, region, backups, networking and operational requirements.

---

## 5. Recommended backend architecture

The application backend should be an API-first TypeScript backend.

Recommended direction:

- NestJS
- TypeScript
- PostgreSQL
- PostGIS
- Prisma
- Redis where justified for caching/rate limiting/queues
- Object storage for files and photos
- REST API under a versioned path such as `/api/v1`
- OpenAPI documentation

Conceptually:

```text
Customer Web ───────┐
                    │
Operations App ─────┼──→ NestJS API / Domain Layer
                    │              │
Owner Web ──────────┘              ├── PostgreSQL + PostGIS
                                   ├── Object Storage
                                   ├── Redis (optional)
                                   └── External providers
```

The backend is authoritative for:
- authentication/authorization
- tenant isolation
- availability
- pricing
- booking transitions
- payments and billing truth
- contracts
- inspections/damage
- notifications/events
- entitlements/licenses

No client application is authoritative for these values.

---

## 6. Why PostgreSQL fits this product

The domain has many related entities and high-value transactions:

```text
Tenant
 ├── Branch
 │    ├── Vehicle
 │    ├── Booking
 │    ├── Maintenance
 │    └── Inspection
 ├── Customer
 ├── Staff
 ├── Pricing Rules
 └── Financial Records
```

Critical operations require:
- transactions
- referential integrity
- unique constraints
- foreign keys
- indexes
- consistent historical records
- concurrency protection

PostgreSQL is therefore the default database choice.

---

## 7. Why not make Redis the database

Redis may be useful for:
- short-lived cache entries
- rate limiting
- job queues
- temporary coordination
- selected realtime/ephemeral state

Redis must not be the source of truth for:
- bookings
- payments
- contracts
- customer identity
- vehicle ownership
- financial history

Durable business truth belongs in PostgreSQL.

---

## 8. File and image storage

Do not store large photos/PDFs directly in PostgreSQL unless there is a deliberate reason.

Use object storage for:
- vehicle photos
- inspection photos
- damage evidence
- identity/document files
- contract PDFs
- generated receipts

PostgreSQL stores metadata and secure object references.

Example:

```text
inspection_photo
- id
- inspection_id
- object_key
- mime_type
- size
- checksum
- captured_at
- uploaded_by
```

Object access must be authorization-aware and should use signed/private access where appropriate.

---

## 9. ORM and migrations

Recommended direction: Prisma.

Prisma is used as an application data-access layer, not as a substitute for understanding SQL or PostgreSQL.

The project must still explicitly understand and document:
- indexes
- foreign keys
- unique constraints
- check constraints where useful
- transactions
- isolation/concurrency considerations
- PostGIS types and queries
- migration safety

Database migrations are versioned and committed to the repository.

Never edit production database structure manually without recording the change through the migration strategy.

---

## 10. PostGIS usage rules

The domain model should distinguish between:
- semantic location identity (branch, pickup point, city, etc.)
- coordinates/geography
- address text
- provider-specific place identifiers

Do not make the system dependent on one map provider.

Keep these concerns separate:
- geocoding
- address autocomplete
- map rendering
- routing/directions
- distance calculation

A map provider can change while the PostgreSQL/PostGIS location model remains stable.

---

## 11. Multi-tenancy and database safety

Every tenant-owned business record must have a clear tenant ownership path.

Examples:
- agency
- branch
- vehicle
- booking
- customer relationship
- maintenance record
- payment record

Tenant isolation must be enforced by backend authorization and data-access rules.

Where technically appropriate, additional database-level safeguards may be evaluated, including PostgreSQL Row Level Security.

Do not assume that a UI filter such as `tenantId = currentAgency` is sufficient security.

---

## 12. Booking concurrency

Booking conflicts are a database correctness problem, not only a frontend validation problem.

The backend must protect against two simultaneous requests attempting to reserve overlapping inventory.

The final design must combine:
- authoritative server-side conflict checking
- transactions
- appropriate isolation/concurrency controls
- suitable indexes/constraints
- idempotency for retryable operations

Exact PostgreSQL constraints and locking strategy will be decided in the Availability and Booking architecture documents.

---

## 13. Database backups and recovery

Production must have an explicit backup and recovery plan.

The plan must define:
- backup frequency
- retention
- recovery point objective (RPO)
- recovery time objective (RTO)
- restore testing
- migration recovery procedure
- who can access backups

A backup that has never been restore-tested is not considered a complete recovery strategy.

The selected managed PostgreSQL provider must be evaluated against these requirements before production launch.

---

## 14. Learning path for the project owner

The owner does not need to become a DBA before building the product.

Learn these concepts in this order:

1. Tables, rows and columns.
2. Primary keys and foreign keys.
3. Relationships and normalization.
4. Indexes.
5. Transactions.
6. Constraints.
7. Migrations.
8. Basic SQL (`SELECT`, `JOIN`, `INSERT`, `UPDATE`, `DELETE`).
9. PostgreSQL roles and connections.
10. PostGIS points, geography, indexes and distance queries.
11. Backups and restore.
12. Connection pooling and production operations.

The project documentation should teach these concepts through the actual Car Rental Platform domain rather than isolated toy examples.

---

## 15. Important terminology

### Database
The persistent data system.

### Database engine
PostgreSQL.

### Extension
PostGIS extends PostgreSQL with geospatial capabilities.

### Managed database
A provider operates the PostgreSQL infrastructure for us.

### Self-hosted database
We operate the PostgreSQL server ourselves.

### ORM
A programming-layer abstraction such as Prisma for interacting with the database while still allowing explicit SQL when necessary.

### Migration
A versioned, repeatable change to database structure.

### Connection pooling
Sharing a controlled number of database connections rather than creating unlimited connections from application requests.

---

## 16. Decision summary

### Database
**PostgreSQL — selected**

### Geospatial extension
**PostGIS — selected**

### Data access layer
**Prisma — recommended**

### Backend
**NestJS + TypeScript — recommended**

### Cache/queue support
**Redis — optional, only when a real requirement exists**

### File storage
**Object storage — selected conceptually**

### Hosted database
**Managed PostgreSQL — recommended for production**

### Supabase
**Allowed and potentially useful as a managed PostgreSQL platform, but the application must not be architecturally dependent on Supabase-specific database behavior.**

---

## Final rule

The platform's durable business truth must live in PostgreSQL.

PostGIS is part of PostgreSQL for geographic data.

Supabase is a hosting/service option, not the definition of the database architecture.

The backend owns business logic. Web and mobile clients consume the backend rather than implementing their own competing business truth.
