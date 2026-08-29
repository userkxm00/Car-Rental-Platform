# Reference Audit — BookCars

Repository: https://github.com/aelassas/bookcars
License: MIT (as stated by the repository README observed during audit; verify upstream LICENSE before copying code)
Priority: Primary reference

## Why it matters

BookCars is a broad cross-platform car-rental platform spanning customer web, admin operations, backend API and mobile. Its documented features include fleet management, time-based availability, vehicle scheduling, dynamic/date-based pricing, payments, hierarchical locations, parking/map search, multilingual/currency support and push notifications.

Architecture reference:
https://github.com/aelassas/bookcars/wiki/Software-Architecture

## Architecture patterns to study and adapt

### Multiple product surfaces behind shared domain rules

BookCars combines frontend, admin, backend and mobile while sharing common types. We want the same principle so web/mobile do not implement different booking or pricing rules.

### API-first and shared contracts

Use a single authoritative backend/domain layer. Shared request/response types and validation contracts should reduce drift between customer web, owner web and mobile.

### Multi-supplier model

BookCars supports one or multiple suppliers. Our architecture should generalize this into explicit organization/tenant + branch ownership so a single agency deployment can later become a multi-agency SaaS platform without a redesign.

### Vehicle scheduler and time-based availability

Study the scheduler/date constraints. Our implementation must not use a single boolean as the source of truth. Availability is computed from time-bounded reservations and operational blocks.

Required blocks include:
- Reservations/rentals.
- Maintenance.
- Inspection/readiness.
- Damage/accident.
- Manual blackout.
- Transfer/repositioning.

### Centralized price calculation

BookCars supports hourly/daily/weekly/bi-weekly/monthly and date-based rates. Our adaptation adds duration tiers, seasons, weekends/holidays, promotions, extras, deposits/fees, transparent breakdowns and immutable booking price snapshots.

### Locations, parking and map search

This is a mandatory area to reproduce conceptually and extend. BookCars explicitly documents hierarchical locations, parking spots, location search and map display.

Our model should support:
- Country.
- Wilaya/region.
- City/area.
- Branch.
- Parking/staging point.
- Airport pickup point.
- Hotel pickup point.
- Delivery zone.
- Custom meeting point where permitted.

Customer map UX should support Map/List, nearby results, location filters, address autocomplete through a provider adapter, and safe display of branch/pickup locations.

### Payments

BookCars demonstrates multiple gateways and payment methods. We adopt the abstraction idea, not the provider assumptions. Algeria requires WebMarchand application, technical tests and certification/authorization for online payment integration; see `research/algeria-and-maghreb.md`.

### Notifications

Study automated and push notifications. We will build a central event-driven notification center with channel adapters and user preferences.

### Localization and currencies

BookCars demonstrates multiple languages/currencies. Our baseline is Arabic/French/English with real RTL support and DZD primary market formatting; currency architecture must allow MAD/TND/EUR and more.

### Native mobile

Use the shared-backend principle for Android/iOS customer and staff experiences. Business rules must remain server authoritative.

### Quality and observability

Study the project's testing, coverage, CI and error/performance monitoring practices. Our definition of done includes automated tests and production observability for critical workflows.

## Product improvements we make

- First-class inspection and damage evidence.
- Post-return vehicle readiness workflow.
- Vehicle profitability and operating-cost visibility.
- Owner attention/exception center.
- Staff task workflow.
- Customer My Rental lifecycle.
- Regional payment/manual reconciliation.
- Stronger Arabic RTL experience.
- North-African location types and delivery zones.
- Data-grounded AI assistance.

## Do not blindly copy

- Branding, wording, visual identity or UI layout.
- Exact database schema.
- Exact implementation patterns when our architecture differs.
- Provider-specific payment assumptions.
- Any feature without a business rule, permission model or test strategy.

## Source feature inventory

The upstream repository documents supplier/fleet management, bookings, vehicle scheduler, dynamic pricing, date/time constraints, payment methods/gateways, hierarchical locations/parking/maps, customer management, multilingual/currency support, responsive web/admin, mobile and push notifications.

Source: https://github.com/aelassas/bookcars
