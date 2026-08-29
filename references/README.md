# Audited Reference Registry

These repositories are research references, not the source of truth for this product.

## Reference 1 — BookCars

Repository: https://github.com/aelassas/bookcars
License observed: MIT
Role: Primary architecture and feature reference.

Study areas:
- web + admin + mobile composition
- supplier / multi-supplier model
- fleet management
- booking and scheduling
- availability constraints
- pricing calculation
- payments
- locations and parking
- notifications
- localization/currencies
- shared types/packages
- API and application boundaries
- testing and operational tooling

Adopt as patterns only after comparison with our requirements.

## Reference 2 — Real Rent Car

Repository: https://github.com/Mohamed-Galdi/real-rent-car
Role: Secondary product/workflow reference.

Study areas:
- admin/client workflows
- real-time availability presentation
- client portal
- support tickets
- payment tracking
- reporting/analytics
- security/2FA patterns

## Reference 3 — Car Rental Website

Repository: https://github.com/Abdellatif404/Car-Rental-Website
Role: Booking/search UX reference.

Study areas:
- search and filtering
- vehicle presentation
- reservation journey
- pricing presentation

## Reference 4 — Updated Car Rental

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

## Reference handling rules

For every useful reference pattern, document:

1. Source and exact area inspected.
2. What problem it solves.
3. What we learn from it.
4. Whether our product adopts, improves, changes, or rejects it.
5. Any compatibility/security implications.

Never copy branding, product identity, or large blocks of code. The project specification and accepted architecture decisions remain authoritative.
