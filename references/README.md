# Audited Reference Registry

These repositories are research references, not the source of truth for this product.

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

Dedicated audit: `references/fleet-management.md`

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

Dedicated audit: `references/advanced-ideas-audit.md`

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

Dedicated audit: `references/advanced-ideas-audit.md`

## Reference 9 — Car Rental Agreement

Repository: https://github.com/fcoinnet/carrentalagreement
Role: contract/PDF/localization idea reference.

Study areas:
- customizable contract templates
- PDF output
- multilingual contracts
- Arabic RTL
- white-label document presentation

Dedicated audit: `references/advanced-ideas-audit.md`

## Reference handling rules

For every useful reference pattern, document:

1. Source and exact area inspected.
2. Problem it solves.
3. What we learn.
4. Whether our product adopts, improves, changes or rejects it.
5. Compatibility/security implications.

Never copy branding, product identity, or large blocks of code. The product specification and accepted architecture decisions remain authoritative.
