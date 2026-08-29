# Car Rental Platform — Replit Agent Context

## Mission

Build a production-grade multi-tenant SaaS platform for car-rental businesses. The platform must improve both sides of the rental operation: agency owners/staff get operational control, financial visibility, fleet intelligence, and automation; customers get a fast, trustworthy booking and rental experience through web and mobile.

## Product surfaces

1. Customer Web
2. Customer Mobile App for iOS and Android
3. Owner/Admin Web
4. Staff operational mobile experience
5. Shared backend API and domain services

## Core domains

- Organizations / tenants
- Branches and locations
- Users, roles, permissions
- Fleet and vehicle categories
- Vehicle availability and scheduling
- Reservations / bookings
- Pricing and promotions
- Customers and customer profiles
- Contracts and documents
- Pickup / return operations
- Inspection and damage
- Maintenance
- Payments, deposits, refunds, billing
- Notifications
- Partners, referrals, loyalty
- Analytics and reporting
- AI-assisted operational intelligence
- Audit logs

## Non-negotiable engineering rules

- Never invent a business rule when documentation exists.
- Never rely on client-side validation for security or financial correctness.
- All critical business rules must be enforced server-side.
- Never allow overlapping active bookings or operational blocks for the same vehicle.
- Never trust client-supplied totals, permissions, tenant IDs, ownership, or status transitions.
- Preserve historical booking, pricing, payment, contract, and inspection facts with immutable snapshots where required.
- Enforce tenant isolation on every tenant-owned resource and query path.
- Keep authorization checks close to protected business operations, not only in UI routing.
- Do not hardcode credentials, secrets, API keys, or private configuration.
- Do not introduce dependencies, services, or architectural patterns without documenting why they are needed.
- Do not make broad rewrites when a focused change is sufficient.
- Do not silently alter an accepted architecture decision; create/update an ADR.
- Critical workflows require automated tests before being considered complete.

## Agent workflow

Before a major implementation:

1. Read `AGENTS.md`.
2. Read the relevant files under `docs/`.
3. Read the relevant files under `architecture/`.
4. Read the relevant audited references under `references/`.
5. Inspect the current implementation and database state.
6. Identify affected domains, migrations, APIs, permissions, tests, and documentation.
7. Make a small implementation plan.
8. Implement incrementally.
9. Run relevant tests, type checks, linting, and build/validation checks.
10. Update documentation and ADRs when decisions or behavior change.

## Reference policy

Reference projects are for learning patterns, workflows, architecture ideas, and UX concepts. Do not blindly clone their implementation, schema, wording, branding, or UI. Prefer understanding the underlying problem and implementing a cleaner solution consistent with this repository's specification.

Primary reference: `aelassas/bookcars`.
Secondary references: `Mohamed-Galdi/real-rent-car`, `Abdellatif404/Car-Rental-Website`, `Brownie-08/Updated-Car-Rental`.

## Critical domain concepts

### Availability
Vehicle availability is a computed business state influenced by bookings, maintenance, inspection, damage, transfers, manual blocking, and other operational events. Do not model availability as a single trusted boolean.

### Pricing
Pricing must be centralized in a dedicated pricing engine/service. Booking totals must be calculated server-side. A confirmed booking must retain the applicable price/discount/fee snapshot so future price changes do not rewrite historical bookings.

### Booking integrity
Every booking transition must be explicit and validated. Prevent double booking through authoritative server-side conflict checks and appropriate database constraints/transaction handling.

### Financial integrity
Payments, deposits, refunds, outstanding balances, invoices, and booking totals must have auditable records. Never derive historical financial truth solely from mutable current configuration.

### Inspection
Pickup and return inspections are first-class workflows. Record mileage, fuel, condition, photos, reported damage, responsible actor, timestamps, and the relationship to the rental event. Future AI-assisted comparison must fit this model rather than bypass it.

### Multi-tenancy
The architecture must support multiple agencies and multiple branches while preventing cross-tenant access. Tenant ownership and authorization must be explicit in data access and APIs.

## Localization baseline

The initial product must support Arabic, French, and English, with DZD as a primary market currency and an architecture that can support additional currencies/languages later. RTL must be treated as a first-class UI requirement.

## Product philosophy

This should be an operating platform, not a CRUD database. Important screens should help users understand what requires attention, what changed, what is due next, and what action should be taken.
