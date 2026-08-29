# Technical Stack & Platform Architecture — Proposed Baseline

## Status

Proposed baseline for review before implementation. Technology decisions become binding only after the corresponding ADR is accepted.

## Product constraint

Release 1 consists of:
- Customer Web
- Agency Owner/Admin Web
- Agency Operations Mobile App
- Platform Owner/Admin Web

Customer Mobile App is a later client and must reuse the same backend/API/domain layer.

## Recommended architecture

Use a **modular monolith backend** first, not microservices.

Why:
- the product has many tightly related transactional domains
- booking, availability, pricing, payment and fleet rules need strong consistency
- a modular monolith is easier to develop and test with Replit Agent
- modules can later be extracted into services if actual scale requires it

NestJS supports modular organization and can be used in standard or monorepo mode; the final repository structure should favor clear domain modules and shared libraries rather than premature service decomposition.

## Backend

### Framework

**NestJS + TypeScript**

Rationale:
- strong TypeScript support
- dependency injection and module boundaries
- guards/interceptors/pipes suitable for auth, validation and observability
- good fit for a modular monolith
- clear API/controller/service separation

### API

**REST API, versioned**

Principles:
- `/api/v1/...`
- OpenAPI/Swagger contract
- server-authoritative business rules
- idempotency for critical write operations
- consistent error envelope
- correlation/request IDs
- pagination/filter/sort conventions

GraphQL is not required for Release 1.

## Database

### Primary database

**PostgreSQL**

The system is relational and transactional by nature:
- tenants
- branches
- vehicles
- reservations
- pricing rules
- payments
- contracts
- inspections
- maintenance
- users/permissions

PostgreSQL is the source of truth for business state.

### Geo capability

Enable **PostGIS** because the map is a first-class feature.

Use geospatial types/indexes for:
- branches
- parking points
- pickup/drop-off locations
- delivery/service zones
- cities/areas where useful
- distance/proximity search

Do not store map coordinates only as unindexed numeric latitude/longitude columns when spatial queries are required.

The database remains provider-neutral: Google Maps, Mapbox, and OpenStreetMap-based services are integrations at the application layer.

### Optional database extensions

Only enable extensions with a documented use case. Candidates:
- PostGIS — required for geospatial capabilities
- pg_trgm / full-text search support — only if search requirements justify it
- pgvector — only when a concrete AI/vector use case is approved
- pg_cron — only when scheduled database-side jobs are genuinely needed

Do not enable a large collection of extensions by default.

## Database access / ORM

Use **Prisma** unless implementation testing proves a material limitation for the booking/availability domain.

Requirements:
- migrations committed to git
- explicit schema review
- transaction boundaries visible in code
- no destructive production migrations without an explicit migration plan
- generated types used where practical

For advanced PostgreSQL/PostGIS functionality that is not well represented by the ORM, use reviewed SQL through a controlled repository layer rather than scattering raw SQL throughout the application.

## Authentication and authorization

Preferred baseline:
- secure session/token strategy appropriate to web and mobile
- password hashing with a modern password-hashing algorithm when passwords are supported
- optional email/phone verification
- MFA/2FA for privileged accounts as a roadmap feature, with stronger requirements for platform-owner access
- RBAC + permission checks + tenant scope

Do not use a role string from the client as proof of privilege.

## Multi-tenancy

Tenant scope is mandatory for tenant-owned entities.

Conceptually:

Platform
  → Tenant/Agency
      → Branch
          → Fleet / Bookings / Customers / Staff / Financial records

Every data-access path must enforce tenant scope.

A later migration to PostgreSQL Row Level Security may be evaluated as defense-in-depth. Application-layer authorization remains required.

## Cache / ephemeral infrastructure

### Redis

Use Redis only when a concrete workload requires it, for example:
- short-lived caches
- distributed rate limits
- job coordination
- idempotency support where appropriate
- realtime/presence support

Do not make core business truth depend on Redis.

## Background jobs

Use a durable job-queue abstraction for non-request work:
- notifications
- scheduled reminders
- document processing
- exports
- webhook retries
- analytics aggregation
- AI processing

A Redis-backed queue such as BullMQ may be used if adopted in the final ADR.

Critical business state must be committed to PostgreSQL before asynchronous work is relied upon.

## File/document storage

Store vehicle/customer documents, inspection photos, generated PDFs and other binary objects in object storage rather than PostgreSQL blobs.

Preferred abstraction:
- storage service interface
- signed/temporary URLs
- private-by-default objects
- tenant-aware access controls

Supabase Storage is a practical initial option if Supabase is chosen for managed Postgres/storage. An S3-compatible provider should remain possible later.

## Maps

Create provider adapters with separate responsibilities:
- geocoding
- address autocomplete
- map rendering
- directions/routing
- distance calculation

Do not couple domain entities to Google-specific IDs or UI objects.

PostGIS stores authoritative internal geographic data where appropriate.

## Notifications

Central notification domain/service with adapters:
- in-app
- push
- email
- SMS/WhatsApp later where commercially and technically justified

Business events should produce notification jobs instead of duplicating notification code across clients.

## Mobile

### Release 1

Agency Operations App using React Native/Expo where compatible with the final Replit/mobile setup.

Native capabilities:
- camera
- QR scanning
- location (permissioned)
- push notifications
- secure storage
- document/photo upload

### Later

Customer Mobile App uses the same APIs and domain layer.

## Web

Preferred direction:
- TypeScript
- React-based framework suitable for SSR/SEO/customer booking pages and authenticated administration
- shared design system and shared API client

The exact web framework is subject to an implementation ADR after Replit validation.

## Repository shape

Prefer a monorepo with clear applications and shared packages:

apps/
  web-customer/
  web-admin/
  web-platform-admin/
  mobile-operations/
  api/

packages/
  shared-types/
  validation/
  api-client/
  ui/
  config/

The exact framework-specific layout may differ, but domain boundaries must remain visible.

## Observability

Required baseline:
- structured application logs
- request/correlation IDs
- error tracking
- health/readiness endpoints
- metrics for critical workflows
- audit logs for security and business-critical actions

## Testing

Required categories:
- unit tests
- integration tests
- database/transaction tests
- API contract tests
- E2E tests for critical journeys
- authorization/tenant-isolation tests
- booking conflict/concurrency tests
- pricing correctness tests
- payment reconciliation tests

## Deployment

Target a managed production environment compatible with the chosen stack and Replit workflow.

Required separation:
- local/development
- preview/test
- production

Production secrets must come from environment/secret management and never from source control.

## Non-goals for initial architecture

Do not introduce prematurely:
- microservices fleet
- Kafka/event-streaming infrastructure
- Kubernetes
- GraphQL
- complex ML infrastructure
- multiple databases without a measured need

The product should earn complexity through real requirements.

## Architecture principle

**PostgreSQL is the business source of truth. NestJS owns domain orchestration and authorization. Web and mobile are clients of the same APIs. Redis/jobs are supporting infrastructure, not business truth. PostGIS powers the first-class map/location capability.**
