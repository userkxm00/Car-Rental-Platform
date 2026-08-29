# Marketplace Reference Audit

## Purpose

This document extracts useful product and engineering patterns from open-source vehicle-rental and marketplace repositories. These are research references only. The project's own requirements, business rules, architecture, security rules, and ADRs remain authoritative.

## 1. Aggar — marketplace interaction patterns

Source: https://github.com/Aggar-rent-a-ride/Aggar-App

Observed strengths:
- Distinct customer, renter/owner, and admin experiences.
- Search by type, brand, rating, price, year, and distance.
- Location-prioritized discovery.
- Favorites/quick actions on vehicle cards.
- Booking-request workflow with owner acceptance/decline.
- Real-time messaging with text plus file/photo sharing.
- Push notifications for booking lifecycle events.
- Notification read/unread state.
- Platform moderation and user reporting.
- Admin analytics and content/catalog management.
- Token refresh and local caching concepts in the mobile architecture.
- Feature-based mobile organization with separate data/presentation layers.

Adopt:
- Advanced marketplace search.
- Customer favorites.
- Agency/customer communication channel for a booking.
- Event-driven booking notifications and read state.
- Customer/agency reporting and moderation.

Improve:
- Use agency as the commercial operator rather than treating each vehicle owner as an independent renter where applicable.
- Keep messaging scoped to a booking/agency relationship; do not build an unrestricted social chat system.
- Use backend-authoritative availability and pricing.
- Keep tenant isolation stronger than a client-side role check.

Defer:
- Full multimedia chat if it is not necessary for the initial pilot.

## 2. Renta — QR pickup and owner operations

Source: https://github.com/raishudesu/renta-frontend

Observed strengths:
- Booking produces a QR confirmation.
- Owner dashboard centralizes vehicle and booking management.
- QR scan confirms the booking at pickup.
- Owner location tracking concepts.
- Planned smart scheduling and conflict prevention.
- Push/instant notification concepts.
- Stack separates Next.js frontend, ASP.NET API, PostgreSQL, and AWS services.

Adopt:
- Booking QR as a short-lived operational credential/reference, not as a permanent secret.
- Staff scan workflow for pickup/verification.
- Clear owner operational dashboard.
- Notifications after booking/confirmation/operational events.

Improve:
- QR must be revocable, time-scoped, rate-limited and tied to authorized booking/operation context.
- We use our NestJS domain model and PostgreSQL/PostGIS architecture instead of copying this stack.

Defer:
- Live location tracking until legal/privacy and operational prerequisites are satisfied.

## 3. SolidMVC Car Rental — mature feature catalogue

Source: https://github.com/SolidMVC/Car-Rental-System

Observed strengths:
- Partner role with partner-owned fleets/reservations.
- Customer reviews and ratings.
- Hourly/daily/seasonal/mixed pricing.
- Coupons and discounts.
- Deposits and prepayment.
- Multiple pickup/return locations.
- Distance-based fees.
- After-hours fees.
- Location business hours, including country-specific week/weekend settings.
- Configurable search/customer fields.
- Reservation editing.
- Car and extra blocking by date/location.
- Seasonal vehicle availability.
- Price groups reusable across cars.
- Quote behavior.
- Age requirements.
- Taxes by global/location rules.
- Reservation timeout/grace period.
- RTL support.
- Customizable confirmation emails/invoices.
- API logging and multiple validation/security layers.
- Scalable database/indexing claims.

Adopt:
- Pickup/return location separation.
- Distance-based delivery/return fees.
- After-hours policy support.
- Configurable customer fields by agency policy.
- Reservation timeout/hold policy.
- Seasonal availability and pricing.
- Reusable vehicle price groups/rate plans.
- Age/eligibility rules as configurable policy.
- Reviews and ratings tied to completed experiences.
- Strong invoice/confirmation/document trail.
- Location business-hour configuration.

Improve:
- Implement these as domain services/configuration rather than WordPress settings.
- Explicitly version tax/price/policy rules and snapshot confirmed bookings.
- Replace shortcode-centric UX with API-first web/mobile experiences.

## 4. Autorockin — regional Morocco/North Africa patterns

Source: https://github.com/abdelmoughit555/rental-car

Observed strengths:
- Marketplace framing similar to Airbnb for cars.
- Arabic/French/English support.
- Google Maps search and address autocomplete.
- Image management by vehicle section: front, interior, trunk, etc.
- Availability calendar and block-out dates.
- Smart recommendations planned.
- Price history, price comparisons and view/insight concepts.
- Laravel Actions/Services and events/jobs.
- S3-compatible storage, MinIO locally and AWS S3 in production.
- Authentication with Fortify/Sanctum and policy-based authorization.
- Server-side image processing jobs.
- Feature-specific validation rules.
- PHPUnit and CI workflow.

Adopt:
- Arabic/French/English as first-class product languages.
- Address autocomplete plus map selection.
- Structured vehicle image galleries.
- Price transparency/history concepts.
- Object-storage abstraction and direct-to-storage upload pattern.
- Events/jobs for expensive media work.
- Policy-based authorization.

Improve:
- Use PostgreSQL/PostGIS rather than the project's default SQLite/MySQL-oriented setup because our marketplace requires spatial queries and stronger transactional modeling.
- Keep map-provider-specific APIs behind adapters.
- Treat translations as first-class domain/presentation concerns.

## 5. New reference — modular car rental API

Source: https://github.com/TheOdrig/car-rental-api

Observed strengths:
- Modular monolith organization using Spring Modulith.
- Separate auth, car, rental, damage, payment, dashboard, notification and currency modules.
- Explicit module dependency direction.

Adopt:
- Domain module boundaries and dependency discipline.
- Currency as its own concern.
- Damage and payment separated from rental flow while keeping integration explicit.

Improve:
- Apply the same conceptual boundaries in NestJS rather than copying Java/Spring implementation.

## 6. New reference — NestJS + PostgreSQL rental API

Source: https://github.com/Ossire/Car-Rental-Api

Observed strengths:
- NestJS + PostgreSQL.
- JWT authentication and bcrypt password hashing.
- RBAC guards.
- Soft-delete usage for historical integrity.
- Global exception handling.
- Swagger/OpenAPI.

Adopt selectively:
- NestJS/PostgreSQL implementation lessons.
- Stable error response shape.
- OpenAPI documentation.
- Centralized exception handling.

Improve:
- Do not make soft delete universal; retain or archive according to domain semantics.
- Our Auth design must also support tenant membership, permissions, sessions/devices, MFA roadmap and platform-admin isolation.

## 7. New reference — production-minded TypeScript rental frontend

Source: https://github.com/ahmedalsanadi/car-rental

Observed strengths:
- Next.js + TypeScript.
- Advanced search/filtering.
- Multi-step booking validation.
- JWT authentication concept.
- Price breakdown.
- Mobile-first/PWA direction.
- Accessibility and SEO attention.
- Structured data/sitemap.

Adopt:
- SEO-first marketplace pages.
- Accessible booking flow.
- Responsive mobile-first customer web.
- Clear price breakdown.

## Cross-reference decisions for our product

### Must adopt into Release 1
- Multi-agency discovery.
- Map/list search and proximity filtering.
- Agency profile + agency-specific fleet listing.
- Advanced search/filtering.
- Agency/customer booking communication through controlled channels.
- QR pickup verification.
- Booking notifications.
- Customer favorites.
- Reviews for completed experiences.
- Multiple pickup/return locations.
- Distance/after-hours fees where enabled.
- Seasonal/duration pricing.
- Configurable eligibility fields/policies.
- Arabic/French/English + RTL.
- Structured vehicle galleries.
- SEO + accessibility for public marketplace pages.
- OpenAPI and centralized API errors.

### Architect now, ship later
- Customer mobile app.
- GPS/telematics.
- Advanced chat/media.
- Smart recommendations.
- Dynamic demand pricing.
- Loyalty/referrals/partners.
- Marketplace commissions.
- Online local payment gateways.
- AI damage/document automation.
- PWA installation enhancements.

### Explicitly reject as authoritative patterns
- Client-controlled price or availability.
- Unscoped cross-user chat.
- Raw license-key checks in frontend/business code.
- Provider-specific data models leaking into core domains.
- Blindly copying another project's schema or UI.

## Agent usage rule

When implementing a feature that appears in this audit:

1. Read the relevant reference entry.
2. Open the source repository when implementation detail is needed.
3. Compare the pattern with our own business rules and architecture.
4. Implement our own version.
5. Add/update tests and traceability.
6. Record material architectural changes in an ADR.
