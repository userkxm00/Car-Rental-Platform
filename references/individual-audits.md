# Individual Reference Audits — Detailed Notes

## Aggar
Source: https://github.com/Aggar-rent-a-ride/Aggar-App

### Useful product patterns
- Three distinct experiences: customer, renter/owner, admin.
- Registration collects personal data, credentials, location and user type, followed by verification.
- Customer home emphasizes categories, brands, most rented/popular/all vehicles.
- Advanced filters include rating, price, type, brand, year and distance.
- Nearby-first results use location context.
- Favorites/quick actions reduce friction.
- Booking requests notify owners immediately.
- Owner can accept or decline; decline releases the booking hold.
- Payment confirmation updates both sides.
- Notification center tracks read/unread status.
- Real-time chat supports photo/file sharing.
- Reporting and moderation are built into the platform.

### Our decision
Adopt:
- search and discovery structure
- favorites
- booking-linked messaging
- notification center/read state
- moderation/reporting
- explicit customer/agency/admin surfaces

Change:
- Agency is the commercial operator; vehicles are not necessarily peer-to-peer owned.
- Messaging is booking/agency scoped and policy controlled.
- Authorization/tenant isolation must be backend-enforced.

## Renta
Source: https://github.com/raishudesu/renta-frontend

### Useful product patterns
- Booking confirmation includes unique QR.
- Owner receives booking information.
- Owner scans QR at pickup to verify renter/booking.
- Owner dashboard combines vehicle and booking data.
- Smart scheduling concept explicitly targets conflict prevention.
- GPS/location tracking is positioned for pickup coordination.
- Push notifications are part of operational workflow.
- Frontend/backend/database/hosting are separate layers.

### Our decision
Adopt:
- QR-based pickup lookup/verification
- owner/staff operational dashboard
- push notification architecture

Safety requirements:
- QR is a short-lived signed/revocable operational credential or lookup token.
- Scan must require staff authorization and correct booking context.
- Do not expose customer secrets in QR contents.

Defer:
- live vehicle GPS until privacy, consent, hardware and legal requirements are settled.

## SolidMVC Car Rental
Source: https://github.com/SolidMVC/Car-Rental-System

### Useful product patterns
- Partner role can own a fleet and reservations.
- Reviews and ratings.
- Hour/day/season/mixed pricing.
- Price groups reduce repetitive rate configuration.
- Coupons and discounts.
- Deposits/prepayments.
- Different pickup and return locations.
- Distance fees.
- After-hours pickup/return fees.
- Configurable opening/lunch hours and weekday/weekend settings.
- Configurable search fields and customer fields.
- Reservation editing.
- Car/extra blocking by date and location.
- Seasonal vehicle availability.
- Age checking.
- Tax manager with location-specific rules.
- Reservation timeout/grace period.
- RTL support.
- Customizable emails and invoices.
- Request logging and multiple input validation layers.

### Our decision
Adopt most of the underlying business ideas, but implement as an API-first multi-tenant domain model.

Particularly important for Algeria/Maghreb:
- after-hours policies
- manual payment support
- pickup/return location flexibility
- distance/delivery fees
- country/locale-specific week/weekend configuration
- Arabic RTL
- flexible customer-data requirements
- price groups/rate plans

## Autorockin
Source: https://github.com/abdelmoughit555/rental-car

### Useful product patterns
- Marketplace framing: discover/list/rent across a network.
- Arabic, French and English support.
- Google Maps search and address autocomplete.
- Structured vehicle media sections such as front/interior/trunk.
- Availability calendar and block-out dates.
- Price history/comparison/insight ideas.
- Laravel Actions/Services, events and jobs.
- S3-compatible object storage; MinIO locally and AWS S3 in production.
- Policy authorization.
- Presigned upload workflow.
- Image-processing jobs.
- Server-side validation and tests.

### Our decision
Adopt:
- trilingual UX
- structured vehicle gallery
- address autocomplete + map selection
- media object-storage abstraction
- presigned upload architecture
- price-history transparency
- asynchronous image processing
- action/service separation as a conceptual pattern

Change:
- PostgreSQL + PostGIS rather than relying on the project's default DB path.
- Our provider abstraction must allow map/storage provider changes.

## New: TheOdrig car-rental-api
Source: https://github.com/TheOdrig/car-rental-api

### Useful patterns
- Modular monolith with explicit module dependency graph.
- Separate auth, car, rental, damage, payment, dashboard and notification modules.
- Shared core module.

### Our decision
Adopt the modular-boundary discipline in NestJS.

## New: Ossire Car-Rental-Api
Source: https://github.com/Ossire/Car-Rental-Api

### Useful patterns
- NestJS + PostgreSQL.
- JWT + bcrypt.
- RBAC guards.
- Centralized exception handling.
- Swagger/OpenAPI.
- Soft-delete pattern for some historical data.

### Our decision
Use the engineering patterns selectively. Do not make soft deletion universal.

## New: ahmedalsanadi/car-rental
Source: https://github.com/ahmedalsanadi/car-rental

### Useful patterns
- Next.js + TypeScript.
- Multi-step booking validation.
- SEO and structured data.
- Accessibility-focused UI.
- PWA direction.
- Clear customer/admin separation.

### Our decision
Apply SEO/accessibility to public Marketplace pages.

## New: neighborDrive
Source: https://github.com/slayer1371/neighborDrive

### Useful patterns
- Next.js/TypeScript.
- Prisma + PostgreSQL.
- role-based access.
- damage-report workflow.
- S3 + CDN concepts.
- AI damage-analysis concept.
- email notifications.

### Our decision
Use as an additional reference for the future AI damage pipeline and media architecture, not as the core architecture benchmark.

## New: Frontend/API contract reference
Source: https://github.com/ahdevworker03/vehicle-rental-platform

### Useful patterns
- Monorepo/workspace organization.
- OpenAPI specification as contract source.
- Generated typed API client and validation schemas.
- Mobile-first RTL Arabic UI.
- realistic business-state mock data before backend integration.

### Our decision
Adopt the principle of contract-first API definitions and realistic domain-state prototyping.

## Consolidated high-value lessons

1. Marketplace search needs location, availability and clear ranking signals.
2. Agency profile pages should be first-class discovery pages.
3. A booking should be a domain workflow, not a database row with a mutable status.
4. QR should accelerate physical operations without becoming an auth bypass.
5. Reviews should be tied to genuine completed rental experiences.
6. Pricing must support duration, season, location, extras, discounts and historical snapshots.
7. Location is a domain: branch, pickup, return, airport, hotel, delivery zone and parking have distinct operational meanings.
8. Media is a workflow: upload, validation, storage, derivatives, evidence, access control.
9. Public pages require SEO and accessibility; internal operations require speed and error prevention.
10. Realtime communication/notifications should be event-driven and scoped.
11. The architecture should remain modular without premature microservices.
12. Provider integrations must be replaceable adapters.
