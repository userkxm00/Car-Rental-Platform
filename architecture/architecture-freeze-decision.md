# Architecture Freeze Decision

## Status

**FROZEN — Release 1 Core Architecture**

This document records the approved baseline for implementation. It does not prevent future evolution; it requires material architectural changes to be documented through an ADR and impact review.

## Approved product model

The platform has three connected layers:

1. **Agency SaaS** — each agency operates its own fleet, bookings, staff, pricing, customers, documents, money and operations.
2. **Customer Marketplace** — a regional discovery/booking layer where customers can search across participating agencies, compare eligible offers and enter an agency-specific booking.
3. **Platform Control Plane** — private administration for tenant lifecycle, verification, plans, subscriptions, licenses, entitlements, ads, marketplace policy, moderation and platform operations.

## Release 1 surfaces

- Customer responsive Web marketplace and booking experience.
- Agency Owner/Admin Web.
- Agency Operations Mobile App.
- Private Platform Owner Web.
- One shared backend/domain platform.

Dedicated Customer Mobile is Release 2+ and must consume the same APIs/domain contracts.

## Approved technical baseline

- Primary language: TypeScript.
- Backend: NestJS modular monolith.
- Database: PostgreSQL.
- Geospatial database extension: PostGIS.
- ORM/data access: Prisma, with isolated SQL/adapter paths for PostGIS-specific operations where required.
- Web applications: TypeScript/React-based applications; exact framework implementation is subject to the public-web SEO requirements and project setup.
- Mobile: React Native + Expo for agency operations.
- API: versioned REST API under `/api/v1`, documented with OpenAPI.
- Object/file storage: provider-neutral object storage; database stores metadata and access references.
- Redis/background jobs: introduced where required for caching, rate limiting, asynchronous work and scheduled tasks; Redis is never the source of truth.
- Observability: structured logging, error monitoring, metrics/tracing appropriate to production.

## Identity and authorization

Authentication provider remains behind an abstraction. The system must support secure web and mobile sessions/tokens, verification, password recovery, MFA for privileged accounts where enabled, and device/session management.

Authorization uses:

`User → Tenant Membership → Role → Permission → Tenant/Resource scope`

Platform administration is logically and operationally separate from agency authorization.

No frontend-only authorization is accepted.

## Multi-tenancy

Tenant isolation is mandatory from the first migration onward. Every tenant-owned resource has an explicit ownership path and every protected read/write path derives tenant scope server-side.

## Booking/availability/pricing invariants

- Booking transitions are explicit domain commands.
- Availability is computed from time-bounded commitments/blocks, not a trusted vehicle boolean.
- Confirmation/assignment/extension are concurrency-sensitive operations protected by transaction/conflict mechanisms.
- Booking prices are calculated server-side and persisted as historical snapshots at the appropriate lifecycle point.
- Monetary arithmetic uses decimal-safe/integer-minor-unit semantics.
- Duplicate/retry-sensitive operations support idempotency.

## Marketplace

Customer search is across participating agencies, subject to agency exposure/verification/policy settings.

Search context can include:
- city/wilaya/area
- branch/pickup point
- airport/hotel where enabled
- start/end date and time
- return location
- vehicle category and attributes
- price range
- distance

Each result clearly identifies its agency. Marketplace ranking uses documented business signals and never silently represents sponsored content as neutral ranking.

Agency public profiles are first-class surfaces containing agency identity/trust state, locations, policies, ratings/reviews, and that agency's own enabled vehicles/offers.

## Maps and geography

Maps are a first-class feature.

Use PostGIS for authoritative spatial queries where beneficial, with provider-neutral map/geocoding adapters. Supported concepts include branch points, parking/pickup points, delivery polygons, proximity search, map/list results, address autocomplete and future one-way/repositioning logic.

Do not expose sensitive live customer/vehicle coordinates publicly by default.

## Localization

Release 1 supports:

- Arabic
- French
- English
- RTL as a first-class layout requirement
- DZD as the primary market currency
- locale-aware date/number/currency formatting
- architecture for additional regional currencies and policies

## Regional payment strategy

Customer-to-agency payment supports manual/offline flows first:
- cash
- bank transfer
- pay at agency
- deposits
- partial payment
- manual reconciliation

Agency-to-platform monetization is provider-neutral and can support:
- free
- configurable trial
- subscription
- license key
- manual renewal
- future Chargily/other gateway adapters

These mechanisms may coexist.

## Monetization and advertising

Platform Owner may independently enable/disable:
- Free plan
- Trial
- Paid subscription
- License keys
- Manual renewal
- Marketplace commission
- Google Ads/AdSense-style advertising on eligible public surfaces

Ads are never allowed to alter booking truth, bypass safety, expose private data, or interfere with payment/contract/inspection/security flows.

## Reviews and trust

Reviews are tied to qualifying rental experiences. Support rating, written comments, agency replies, reporting and moderation. Customer reputation/risk signals remain distinct from public ratings.

## Inspection and damage

Pickup and return inspections are first-class. Capture checklist, mileage, fuel, structured photos, actor/timestamps and damage evidence. AI may assist later but cannot become sole liability authority.

## Security baseline

- server-side validation
- tenant isolation
- RBAC/permission checks
- rate limiting and abuse controls
- secure file access
- secret management
- audit logs for sensitive actions
- idempotency for retry-sensitive operations
- provider webhook verification
- dependency/security checks in CI

## What is intentionally deferred

The following are architected for compatibility but do not block Release 1:

- Customer Mobile App
- advanced AI workflows
- autonomous smart pricing
- live GPS/telematics
- full partner ecosystem
- loyalty/referrals
- advanced online payment integrations
- large-scale marketplace finance/settlement automation

## Change policy after freeze

A material change to any of the following requires an ADR:

- database technology
- tenancy model
- identity architecture
- authorization model
- booking/availability invariants
- API contract strategy
- mobile/web surface responsibilities
- monetary/financial source-of-truth rules
- storage/security model
- deployment topology

Feature additions that stay within the approved architecture can proceed through normal implementation planning.

## Freeze acceptance criteria

Architecture Freeze is considered valid because:

- Product scope is separated from future scope.
- Critical business invariants are explicit.
- Database/domain boundaries are defined.
- Tenant and authorization boundaries are explicit.
- Provider-specific dependencies have adapters/abstraction points.
- Release 1 client surfaces are defined.
- Security/testing/observability expectations are defined.
- Marketplace and agency SaaS models are consistent.

## Next phase

**Phase 01 — Identity & Access**

No production feature work should begin outside Phase 01 unless it is explicitly classified as preparatory infrastructure.
