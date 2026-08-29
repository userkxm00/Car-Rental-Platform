# Provider & Environment Contract — Release 1

## Purpose

This document defines concrete Release 1 providers and how their configuration enters the application. Provider choice must not leak into domain logic.

## Authoritative providers

| Capability | Release 1 decision | Role |
|---|---|---|
| Identity | Supabase Auth | Authentication/identity provider only |
| Database | PostgreSQL + PostGIS | Authoritative application/domain data |
| ORM | Prisma | Primary data access |
| Maps | MapLibre + MapTiler Cloud | Rendering + map/search/geocoding provider |
| Object storage | Cloudflare R2 | Private media/document object storage |
| Cache/jobs | Redis | Cache, queues, rate limits, ephemeral coordination |
| Error monitoring | Sentry | Error monitoring and operational evidence |
| Search | PostgreSQL/PostGIS | Release 1 search/discovery |
| Realtime | REST + notification/invalidation patterns | No mandatory WebSocket dependency |
| Payments | Manual/Cash/Bank Transfer for Release 1 customer flow | Online provider remains optional/future |

## Provider-boundary rules

- Domain modules must not import provider SDK types directly.
- Provider-specific identifiers must be mapped to application-level identifiers.
- Provider adapters live in infrastructure/integration boundaries.
- Provider secrets are only loaded from environment/secret management.
- Tests should use local/test implementations where possible.
- Changing a provider must not require rewriting business rules.

## Environment handling

`.env.example` documents required variables and contains placeholders only.

Real values must be supplied through:

- Replit encrypted Secrets during development/preview where applicable.
- Production platform secret/environment management in deployment.

Never commit `.env`, real credentials, access tokens, service-role keys, R2 secrets, or private signing/encryption keys.

## Maps

Frontend uses MapLibre for rendering. MapTiler is the initial provider for tiles/search/geocoding.

`MAPTILER_API_KEY` is treated as a frontend-facing provider key and must be restricted by allowed origins/referrers and the provider's documented controls. It is not an application authorization secret.

PostGIS remains authoritative for stored coordinates, tenant-owned locations, delivery zones and spatial business queries.

## Supabase Auth

Supabase Auth provides login/session/authentication capabilities. NestJS remains authoritative for:

- application User identity mapping
- tenant membership
- roles
- permissions
- resource ownership
- entitlements
- all business rules

A Supabase user ID must never by itself grant access to a tenant or resource.

## Cloudflare R2

R2 is used for private object storage. PostgreSQL stores media metadata and references, not binary files by default.

Required controls:

- private objects by default
- controlled/signed access
- MIME/type validation
- size limits
- checksum/metadata when useful
- retention/deletion policy

## Redis

Redis is non-authoritative. Losing Redis must not corrupt:

- bookings
- payments
- balances
- tenant ownership
- audit history

Queues and caches must be retry-safe and reconstructable.

## Sentry

Use Sentry for exceptions and operational diagnostics. Do not send passwords, access tokens, full identity documents, payment secrets, or unnecessary sensitive personal data to Sentry.

## Release 1 payment rule

Customer checkout must work without an online payment gateway. Supported operational methods are cash, bank transfer, pay-at-agency and manual confirmation, with deposits where configured by the agency.

Online providers such as Chargily must be added behind the same payment adapter and revalidated against current commercial/legal/technical requirements before activation.

## Provider activation timing

Not every provider is required before Phase 01. Configure only what the current implementation phase needs.

Expected timing:

- Phase 01: Supabase Auth + PostgreSQL
- Fleet/media phases: R2
- Marketplace/maps phase: MapTiler + MapLibre
- jobs/notification phases: Redis
- production hardening: Sentry + production hosting/backup configuration

## Local development baseline

The preferred local foundation is reproducible/containerized PostgreSQL + PostGIS and Redis. External provider integrations should have local/test-safe adapters or mocks until real credentials are needed.
