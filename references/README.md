# Audited Reference Registry

These repositories are research references, not the source of truth for this product. The project's accepted requirements, business rules, architecture, security rules and ADRs remain authoritative.

## Reference 1 — BookCars

Repository: https://github.com/aelassas/bookcars
License observed: MIT
Role: Primary architecture and feature reference.

Study/adapt:
- web + admin + mobile composition
- supplier / multi-supplier model
- fleet management
- booking and scheduling
- availability constraints
- pricing calculation
- payments
- locations, parking and maps
- notifications
- localization/currencies
- shared types/packages
- API/application boundaries
- testing and operational tooling

Dedicated audit: `references/bookcars.md`

## Reference 2 — Autorockin / rental-car

Repository: https://github.com/abdelmoughit555/rental-car
Role: Regional/product reference for Morocco and wider North Africa.

Study/adapt:
- Arabic/French/English
- map search and address autocomplete
- structured vehicle galleries
- availability calendar
- price history/comparison concepts
- recommendation/insight concepts
- S3-compatible media architecture
- Actions/Services and event/job patterns

Dedicated audit: `references/autorockin.md`

## Reference 3 — Real Rent Car

Repository: https://github.com/Mohamed-Galdi/real-rent-car
Role: Secondary product/workflow reference.

Study areas:
- admin/client workflows
- availability presentation
- client portal
- support tickets
- payment tracking
- reporting/analytics
- security/2FA patterns

## Reference 4 — Car Rental Website

Repository: https://github.com/Abdellatif404/Car-Rental-Website
Role: Booking/search UX reference.

Study areas:
- search and filtering
- vehicle presentation
- reservation journey
- pricing presentation

## Reference 5 — Updated Car Rental

Repository: https://github.com/Brownie-08/Updated-Car-Rental
Role: Backend engineering reference; not a product-quality benchmark.

Study areas:
- API separation
- background processing
- Redis/Celery-style async work
- WebSockets/realtime concepts
- OpenAPI
- payment webhooks
- audit logs
- Docker
- testing

## Reference 6 — Fleet Management Systems

Repositories:
- https://github.com/caliphviper/Fleet-management-system
- https://github.com/navodya0/FMS

Role: fleet lifecycle reference.

Study areas:
- vehicle document expiry
- inspection/post-check workflows
- maintenance records
- rental conflict prevention
- readiness and approval flows
- fleet role-based dashboards

## Reference 7 — Advanced Rental Ideas

Repository: https://github.com/EsLaM-Media/Car-Rental-Booking
Role: advanced concept catalog, not architecture benchmark.

Study areas:
- GPS/Traccar
- live fleet map
- visual damage blueprint
- distance-based fees
- multi-vendor commissions
- wallet/cashback
- omnichannel notifications
- risk flags

## Reference 8 — Ipark

Repository: https://github.com/abdelrany/Ipark
Role: map/location interaction reference, not rental architecture.

Study areas:
- map discovery
- filters
- pins and pricing
- directions
- location detail cards
- extension/time workflow

## Reference 9 — Car Rental Agreement

Repository: https://github.com/fcoinnet/carrentalagreement
Role: contract/PDF/localization idea reference.

Study areas:
- customizable contract templates
- PDF output
- multilingual contracts
- Arabic RTL
- white-label document presentation

## Reference 10 — Aggar

Repository: https://github.com/Aggar-rent-a-ride/Aggar-App
Role: marketplace interaction and communication reference.

Study areas:
- customer/renter/admin role separation
- location-prioritized search
- rating/price/type/brand/year/distance filters
- favorites
- booking request/accept/decline flow
- booking-linked notifications
- read/unread notification state
- real-time messaging with media
- reporting/moderation
- feature-based mobile organization

Dedicated audit: `references/individual-audits.md`

## Reference 11 — Renta

Repository: https://github.com/raishudesu/renta-frontend
Role: owner operations and QR pickup reference.

Study areas:
- QR confirmation
- pickup scan/verification
- owner dashboard
- booking notifications
- scheduling/conflict prevention concept
- GPS/location coordination concept
- API/frontend/database separation

Dedicated audit: `references/individual-audits.md`

## Reference 12 — Modular car-rental API

Repository: https://github.com/TheOdrig/car-rental-api
Role: modular-monolith/domain-boundary reference.

Study areas:
- explicit module boundaries
- auth/car/rental/damage/payment/dashboard/notification separation
- module dependency direction

Dedicated audit: `references/individual-audits.md`

## Reference 13 — NestJS + PostgreSQL car-rental API

Repository: https://github.com/Ossire/Car-Rental-Api
Role: implementation reference for NestJS/PostgreSQL/API engineering.

Study areas:
- JWT/bcrypt authentication
- RBAC guards
- centralized exception handling
- Swagger/OpenAPI
- historical/soft-delete patterns

Dedicated audit: `references/individual-audits.md`

## Reference 14 — TypeScript rental frontend

Repository: https://github.com/ahmedalsanadi/car-rental
Role: customer web quality reference.

Study areas:
- Next.js/TypeScript
- multi-step booking UX
- SEO/structured data
- accessibility
- mobile-first/PWA direction
- responsive customer/admin experiences

Dedicated audit: `references/individual-audits.md`

## Reference 15 — neighborDrive

Repository: https://github.com/slayer1371/neighborDrive
Role: future AI damage/media reference.

Study areas:
- Prisma + PostgreSQL
- role-based access
- damage workflows
- S3/CDN media
- AI photo analysis
- email notifications

Dedicated audit: `references/individual-audits.md`

## Reference 16 — Vehicle Rental Platform validation prototype

Repository: https://github.com/ahdevworker03/vehicle-rental-platform
Role: contract-first/prototyping reference.

Study areas:
- workspace/monorepo
- OpenAPI as API source of truth
- generated typed API clients and validation schemas
- realistic mock business states
- mobile-first RTL Arabic UI

Dedicated audit: `references/individual-audits.md`

## Reference handling rules

For every useful reference pattern, document:

1. Source and exact area inspected.
2. Problem it solves.
3. What we learn.
4. Whether our product adopts, improves, changes or rejects it.
5. Compatibility/security implications.

Never copy branding, product identity, large blocks of code, or another project's schema blindly. The product specification and accepted architecture decisions remain authoritative.
