# 01 — Product Vision

## Product thesis

Build a production-grade car-rental operating platform that combines agency operations, customer booking, fleet intelligence, and mobile workflows in one system.

The product is not a CRUD fleet database and not only a booking marketplace. It is an operating platform that helps an agency answer four questions continuously:

1. What is happening now?
2. What needs attention?
3. What is the next operational action?
4. Which vehicles, customers, bookings, and channels are creating or losing money?

## Primary product surfaces

- Customer Web: discovery, map-based search, booking, checkout, documents, rental lifecycle.
- Customer Mobile: booking, My Rental, notifications, documents, support, extensions and return workflows.
- Owner/Admin Web: fleet, bookings, pricing, finance, operations, staff, analytics and configuration.
- Staff Mobile: pickup, return, inspections, photos, mileage/fuel, QR lookup, tasks and issue reporting.
- Shared API/domain services: the authoritative source of business rules and data.

## Target geography

Initial priority: Algeria, then Morocco, Tunisia, and wider North Africa/MENA expansion.

The architecture must be international from day one while providing a strong regional baseline:

- Arabic, French, English.
- Full RTL support for Arabic.
- DZD as the initial primary currency; currency abstraction for MAD, TND, EUR and others.
- Date, number and currency formatting by locale.
- Localized contracts, receipts and customer-facing transactional messages.
- Local payment providers through an abstraction layer rather than hard-coding an international gateway.
- Cash, bank transfer and pay-at-counter workflows supported where appropriate.
- Branches, airports, hotels, cities and custom pickup/drop-off locations.

## Product differentiators

### 1. Map-first rental discovery and operations

Use a first-class map and location model inspired by BookCars: hierarchical locations, map search, branch/parking points, pickup/drop-off selection, and location-based availability.

Customer search should support:
- Search near a city, airport, hotel or branch.
- Map/list split view.
- Nearby vehicle/branch results.
- Exact pickup and drop-off locations.
- Different pickup and return locations where allowed.

Owner operations should support:
- Branch coordinates.
- Parking locations.
- Vehicle staging areas.
- Map-based branch visibility.
- Future delivery zones.

### 2. Rental lifecycle, not just reservations

A booking flows through operational states such as inquiry/hold, confirmed, prepared, checked-out, active, return-pending, returned, completed, cancelled, no-show and disputed where applicable.

Every transition is authorized, auditable and validated by server-side rules.

### 3. Fleet intelligence

Each vehicle has a complete lifecycle record covering identity, documents, availability, rentals, mileage, fuel, inspections, damage, maintenance, costs and revenue.

The platform should calculate useful indicators such as utilization, revenue generated, operating cost and profitability where sufficient data exists.

### 4. Inspection and evidence workflow

Pickup and return inspections are first-class workflows. Photos, mileage, fuel, checklist results, notes, actor and timestamps become part of the rental record. Future AI comparison must assist a human reviewer rather than silently decide liability.

### 5. Attention-first operations

Dashboards should prioritize exceptions and actions: overdue rentals, returns due today, missing documents, vehicles unavailable, expiring insurance/inspection, unpaid balances, pending approvals and maintenance readiness.

### 6. Local-first payment architecture

Payment integration must support an adapter/provider model. The core booking and accounting model must not depend on Stripe, PayPal or any single provider.

For Algeria, online card payment integration must account for the merchant onboarding/certification process of SATIM/GIE Monétique. The product should therefore support a payment-provider abstraction and non-gateway methods without assuming every customer or agency can use an online card gateway on day one.

Source: SATIM WebMarchand integration documentation — https://satim.dz/index.php/fr/e-paiement/integration-webmarchand

## Open-source reference policy

References are used to identify proven workflows, data concepts, UX patterns and engineering techniques. We do not blindly copy branding, wording, UI or implementation.

Primary reference:
- https://github.com/aelassas/bookcars

Regional/product reference:
- https://github.com/abdelmoughit555/rental-car

Additional references:
- https://github.com/Mohamed-Galdi/real-rent-car
- https://github.com/Abdellatif404/Car-Rental-Website
- https://github.com/Brownie-08/Updated-Car-Rental
- https://github.com/caliphviper/Fleet-management-system
- https://github.com/navodya0/FMS

## Product principles

- Business truth belongs on the server.
- Historical financial and rental facts must remain reproducible.
- Availability is computed from operational blocks; it is not a single trusted boolean.
- Every tenant-owned resource is tenant-scoped.
- Critical changes are auditable.
- Mobile and web clients consume the same domain/API rules.
- Arabic RTL is a first-class experience, not a translation patch.
- Every customer-facing price must be explainable.
- Every important workflow must have a clear recovery path when something fails.
