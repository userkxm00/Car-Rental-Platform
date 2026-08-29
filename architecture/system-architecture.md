# System Architecture — Preliminary Design

This is a pre-implementation architecture baseline. Technology choices must be finalized only after the full requirements, constraints and Replit environment are assessed.

## Architectural shape

Prefer a modular monorepo with a shared authoritative backend/domain layer and separate customer web, owner/admin web, and mobile experiences.

Conceptual topology:

Customer Web ─┐
Customer Mobile ─┼──> API / Domain Services ──> PostgreSQL
Owner/Admin Web ─┤             │
Staff Mobile ────┘             ├──> Object Storage
                              ├──> Job/Queue infrastructure
                              ├──> Notifications providers
                              ├──> Payment providers
                              └──> Map/geocoding providers

## Core architectural principles

- API/domain layer is the source of truth.
- Business rules live in domain/services, not duplicated in clients.
- Tenant isolation is enforced in every access path.
- Financial and historical records are append-oriented/auditable.
- Integrations are adapter-based.
- Background work handles non-critical side effects.
- Observability is part of production architecture.
- Critical domains have automated tests.

## Domain boundaries

- Identity & Access.
- Organizations/Tenants.
- Locations & Branches.
- Fleet.
- Availability.
- Bookings.
- Pricing.
- Customers.
- Contracts/Documents.
- Inspections/Damage.
- Maintenance/Readiness.
- Payments/Billing.
- Notifications.
- Tasks/Operations.
- Partners/Loyalty/Referral.
- Analytics.
- AI.

## Integration boundaries

Map provider abstraction must separate geocoding, autocomplete, map rendering, routing and distance calculation.

Payment provider abstraction must separate payment intent/authorization, capture, refund, webhook verification and reconciliation.

Object storage abstraction must support images, documents and generated PDFs without coupling the domain to one vendor.

## Concurrency-sensitive domains

Booking, availability and payments require explicit transaction/concurrency design. The implementation must be tested for race conditions, duplicate submissions and webhook retries.

## Mobile architecture

Customer and staff apps should share API contracts and domain models where appropriate but should keep role-specific UX flows. Offline support is limited to safe operational context and must never bypass server authority.

## Localization architecture

Translation keys are centralized. Arabic RTL behavior is implemented at the design-system/layout level. Locale formatting is centralized rather than embedded in individual components.

## Reference lesson

BookCars demonstrates the value of a monorepo, API-first model, shared TypeScript types and separate customer/admin/mobile surfaces. We adopt the principles while keeping our own domain and implementation. Source: https://github.com/aelassas/bookcars/wiki/Software-Architecture
