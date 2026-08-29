# 00 — Project Overview

## Product name

Working name: Car Rental Platform.

## Product type

A multi-tenant SaaS operating platform for car-rental agencies. It combines customer booking experiences with the internal operating system needed to manage vehicles, reservations, customers, staff, money, contracts, inspections, maintenance, and business performance.

## Primary users

### Agency owner / administrator
Needs an immediate view of business health, fleet utilization, revenue, outstanding money, operational exceptions, and upcoming work.

### Agency staff
Needs fast workflows for pickup, return, inspection, damage capture, customer service, vehicle preparation, and daily tasks.

### Customer
Needs to discover available vehicles, understand pricing and conditions, book, pay or reserve, complete required documents, collect/return a vehicle efficiently, extend when possible, and access support.

### Platform administrator
May manage the SaaS itself, tenant lifecycle, plans, platform-level settings, and operational oversight. Platform administration must remain logically separate from agency business data.

## Product surfaces

- Customer website
- Customer mobile application for iOS and Android
- Agency owner/admin web application
- Staff mobile workflows
- Shared backend API
- Internal platform administration surface as needed

## Core operating loop

1. Agency configures fleet, pricing, locations, policies, and staff.
2. Customer searches for a vehicle using location and time.
3. Availability engine determines eligible vehicles.
4. Pricing engine calculates the server-authoritative quote.
5. Customer creates/reserves a booking and completes required verification/payment.
6. Agency prepares the vehicle.
7. Staff performs pickup/check-in and records condition, mileage, fuel, and evidence.
8. Rental remains active with possible extension, incident, support, or other events.
9. Staff performs return/check-out inspection.
10. System settles final charges, deposit/refund, and closes the rental.
11. Analytics and history preserve the business outcome.

## Product differentiators

- Strong operational control, not just online booking.
- Unified web/mobile experience backed by one authoritative domain model.
- Fleet profitability and utilization intelligence.
- First-class pickup/return inspection and damage evidence.
- Intelligent attention/exception center for owners and staff.
- Centralized availability and pricing engines.
- Multi-tenant SaaS design from day one.
- Arabic, French, and English support with RTL treated as first class.
- Algeria-ready monetary and payment architecture without hard-coding a single provider.
- AI used for specific operational value: document extraction, damage comparison, forecasting, and decision support.

## Non-goals for initial release

The project should not attempt to solve every adjacent logistics or mobility problem. GPS/telematics, advanced automated dynamic pricing, external partner ecosystems, and deep AI automation should be architected for future support but only shipped when their prerequisites are stable.
