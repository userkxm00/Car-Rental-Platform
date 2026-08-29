# Reference Audit — BookCars

Repository: https://github.com/aelassas/bookcars
License: MIT (as stated by the repository README observed during audit)
Priority: Primary reference

## Why it matters

BookCars is a broad car-rental platform reference spanning customer web, admin operations, and a mobile application. The README and architecture documentation expose useful patterns for a production rental product.

## Patterns to study and adapt

### 1. Multiple product surfaces behind shared backend/domain concepts

BookCars combines frontend, admin panel, backend, and mobile concerns while sharing common types. This is useful for avoiding divergent rules between web and mobile.

Our adaptation:
- one authoritative backend/domain layer
- customer web and mobile consume the same business APIs
- owner/admin and staff experiences use the same domain model
- shared validation/types where appropriate

### 2. Multi-supplier / supplier management

BookCars can operate with one or multiple suppliers and gives suppliers their own fleet/booking management context.

Our adaptation:
- model agencies/tenants explicitly from day one
- agency owns branches, vehicles, staff, bookings, customers, pricing, and financial records
- tenant isolation must be enforced server-side

### 3. Vehicle scheduler and time-based availability

BookCars treats availability as time-based and includes vehicle scheduling and rental-date constraints.

Our adaptation:
- do not use a single boolean as the source of truth for availability
- compute conflicts using reservations plus operational blocks
- include maintenance, inspection, transfer, damage, and manual blocking as availability-affecting events
- enforce conflict prevention server-side and at the database/transaction layer where appropriate

### 4. Centralized price calculation

BookCars supports hourly/daily/weekly/bi-weekly/monthly rates and date-based rate changes.

Our adaptation:
- dedicated pricing engine
- duration rules
- season/date rules
- weekend/special date rules
- promotions/discounts
- extras/fees/deposit
- server-authoritative final totals
- price snapshot on booking confirmation

### 5. Locations and parking

BookCars models hierarchical locations and parking spots.

Our adaptation:
- country → wilaya → city → branch → pickup/parking zone
- support branch, airport, hotel, and delivery pickup types
- map coordinates are supplementary location data, not the only identifier

### 6. Notification system

BookCars includes automated notifications and push notifications.

Our adaptation:
- centralized event-driven notification system
- in-app + push first
- email/SMS/WhatsApp can be added through provider adapters
- avoid creating duplicate notification logic in each client

### 7. Authentication and localization

BookCars supports several login methods and multiple languages/currencies.

Our adaptation:
- email/phone and optionally social login later
- Arabic/French/English
- first-class RTL
- monetary/currency formatting isolated from business calculations

### 8. Mobile app from a shared codebase

BookCars provides Android/iOS mobile capability.

Our adaptation:
- React Native/Expo-oriented architecture where compatible with the selected implementation stack
- customer and staff workflows optimized for touch/mobile operations
- do not duplicate business rules inside mobile

### 9. Operational observability

BookCars references testing, code coverage, and error/performance monitoring.

Our adaptation:
- unit/integration/E2E testing
- structured errors/logging
- production monitoring
- CI quality gates

## Patterns we should improve

- Make damage/inspection a stronger first-class domain.
- Add immutable financial and rental snapshots where historical truth requires them.
- Add owner attention center and exception-based workflow.
- Add vehicle profitability and utilization analytics.
- Add staff task workflows for pickup/return/preparation.
- Add customer self-service rental lifecycle actions such as extension and issue reporting.
- Add AI assist only around measurable operational tasks rather than generic chat.

## Patterns we should not blindly copy

- Exact database schema.
- Exact UI/branding.
- Exact technology choices when they do not fit Replit/project constraints.
- Any workflow that conflicts with our business rules or Algeria-ready requirements.

## Primary implementation lesson

The most valuable BookCars lesson is architectural: availability, pricing, booking, supplier/tenant management, and client applications should be built as coherent domains behind authoritative server-side rules rather than as disconnected CRUD screens.
