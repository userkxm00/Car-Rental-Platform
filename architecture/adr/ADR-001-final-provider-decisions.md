# ADR-001 — Final Release 1 Provider & Infrastructure Decisions

## Status
Accepted — 2026-08-29

## Context

Release 1 requires concrete provider choices so implementation can proceed without repeated architectural pauses. Core domain logic must remain provider-neutral.

## Decisions

### Identity

Use **Supabase Auth** as the Release 1 Identity Provider.

Supabase handles authentication capabilities such as email/password, verification, recovery and supported MFA flows. The application maintains its own user identity boundary and all authorization, tenant scope and business permissions remain in NestJS/application domain logic.

Supabase Auth is not the source of truth for tenants, memberships, bookings, billing or business permissions.

### Database

Use **PostgreSQL + PostGIS** as the authoritative application database.

Development uses a reproducible local/containerized PostgreSQL + PostGIS environment.

Production uses a managed PostgreSQL service selected for PostGIS support, automated backups, point-in-time recovery, TLS, monitoring and operational access. The deployment provider is replaceable and is not part of the domain model.

Supabase is not required as the production database provider merely because Supabase Auth is used.

### ORM / Data Access

Use **Prisma** as the primary data-access layer.

Use reviewed SQL migrations/queries for PostgreSQL/PostGIS features where Prisma does not provide an adequate abstraction.

### Maps / Geospatial

Use **MapLibre** as the web map rendering layer and **MapTiler Cloud** as the initial managed map/geocoding provider.

MapTiler is accessed only through an internal map/geocoding adapter. MapTiler Free is suitable for testing/R&D but is not assumed to cover commercial production use; a suitable commercial plan must be used before commercial launch.

Authoritative coordinates, branches, pickup points, delivery zones and spatial relationships remain in PostgreSQL/PostGIS.

Routing is optional for Release 1 and must remain behind the same provider interface.

### Object Storage

Use **Cloudflare R2** as the initial S3-compatible object storage provider for production media/document storage, behind an application storage adapter.

Use private buckets/objects, controlled access, signed URLs where appropriate, content validation, checksum/metadata capture and documented retention rules.

R2 is selected for S3 compatibility and predictable egress economics; exact production pricing/quotas must be rechecked at deployment time.

### Cache / Jobs

Use **Redis** only for cache, rate limiting, background jobs and ephemeral coordination where justified.

Redis is never authoritative for bookings, payments, balances or tenant data.

### Observability

Use **Sentry** for application error monitoring and security/error evidence, supplemented by structured application logs and standard metrics/tracing interfaces. OpenTelemetry-compatible instrumentation should be preferred where tracing is introduced.

### Deployment

Use a **container-first deployment model**. Keep application images and environment configuration portable across hosting providers.

Production hosting may be selected or changed during the deployment phase based on cost, geography, PostgreSQL/PostGIS support, backups, uptime, networking and operational requirements. This is not allowed to change the application architecture.

## Security rules

No provider secret is stored in source code. Provider-specific IDs and SDK objects remain in adapters/infrastructure boundaries.

## Consequences

- Fast Release 1 authentication without coupling the business domain to an identity vendor.
- Strong geospatial support without putting map-provider data in the domain model.
- Simple S3-compatible file handling with portable storage semantics.
- Portable deployment architecture.
- Provider replacement remains possible through adapter boundaries.

## Alternatives rejected for Release 1

- Building authentication from scratch in NestJS: unnecessary security/operational burden for initial delivery.
- Making Supabase the entire backend/data platform: conflicts with the desired separation between identity provider and authoritative application domain.
- Google Maps as the initial default: capable but introduces a less cost-predictable dependency for the MVP; the adapter permits adding it later if needed.
- Elasticsearch/OpenSearch as a first-release search dependency: unnecessary operational complexity until PostgreSQL search limits are demonstrated.
