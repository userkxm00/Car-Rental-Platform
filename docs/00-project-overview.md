# 00 — Project Overview

## Product name

Working name: Car Rental Platform.

## Product type

A multi-tenant SaaS operating platform for car-rental agencies with a customer-facing discovery and booking marketplace layer. It combines agency operations with a regional network where customers can discover participating agencies, vehicles, pickup locations, prices, and availability.

This distinction is fundamental:

- **SaaS layer:** each agency uses the platform to operate its own business.
- **Marketplace/discovery layer:** customers can search across participating agencies rather than being locked to one agency.
- **Platform owner layer:** the platform operator controls tenants, plans, licensing, marketplace policies, moderation, and global configuration.

## Primary users

### Agency owner / administrator
Needs an immediate view of business health, fleet utilization, revenue, outstanding money, operational exceptions, and upcoming work.

### Agency staff
Needs fast workflows for pickup, return, inspection, damage capture, customer service, vehicle preparation, and daily tasks.

### Customer
Needs to discover available vehicles/agencies, compare meaningful prices and conditions, select a convenient pickup/return location, book, pay or reserve, complete required documents, collect/return a vehicle efficiently, extend when possible, and access support.

### Platform administrator
Manages the SaaS and marketplace itself: agency onboarding, plans, licenses, entitlements, feature flags, marketplace policies, verification/moderation, disputes at the platform layer, and operational oversight. Platform administration remains logically separate from agency business data.

## Product surfaces — Release 1

- Customer website / responsive marketplace and booking experience.
- Agency owner/admin web application.
- Agency operations mobile application for staff and authorized owners/managers.
- Shared backend API/domain platform.
- Private platform-owner control center.

### Future

- Dedicated customer mobile application using the same backend/domain contracts.

## Customer discovery model

The customer website is not limited to one agency.

A customer may search by:

- city / wilaya / area
- pickup point or branch
- airport
- hotel/accommodation
- date and time
- return location
- vehicle category
- price range
- transmission/fuel/body type/features where relevant

The platform returns vehicles/offers from participating agencies that are actually bookable for the requested context.

Typical journey:

```text
Customer enters:
Pickup location + date/time + return location + date/time
                  ↓
Marketplace search
                  ↓
Availability + pricing engines
                  ↓
Participating agencies/offers
                  ↓
Compare
                  ↓
Choose an offer
                  ↓
Agency-specific booking rules
                  ↓
Booking
```

The marketplace must clearly identify the agency behind every offer. It must not imply that all agencies share ownership of vehicles or operational responsibility.

## Agency autonomy

Each agency remains the operator of its own fleet and bookings.

The platform must support agency-specific:

- pricing
- availability
- locations
- policies
- documents
- deposits
- fees
- cancellation rules
- delivery zones
- staff
- branding/profile

Marketplace exposure is an explicit tenant capability and can be enabled/disabled by platform and agency policy.

## Marketplace ranking and trust

Search ordering must not be an opaque hard-coded preference for a single agency.

The architecture should support ranking signals such as:

- exact availability
- pickup proximity
- price relevance
- agency response/reliability indicators
- customer rating where implemented
- verified agency status
- policy fit

Ranking rules must be documented and should not silently disadvantage agencies without a product/business reason.

## Verification and moderation

Because the marketplace connects customers to independent agencies, the platform needs future-ready controls for:

- agency verification status
- listing/vehicle moderation
- suspicious activity flags
- customer/agency dispute workflows
- marketplace terms acceptance
- reporting and takedown controls

A marketplace listing must never be interpreted as a guarantee of agency conduct beyond the platform's documented verification level.

## Core operating loop

1. Agency configures fleet, pricing, locations, policies, and staff.
2. Eligible agency offers may become discoverable in the marketplace.
3. Customer searches the regional marketplace using location and time.
4. Availability engine determines eligible inventory across participating agencies.
5. Pricing engine calculates server-authoritative offers.
6. Customer selects an agency offer and creates/reserves a booking.
7. Required verification/payment/document steps are completed.
8. Agency prepares the vehicle.
9. Staff performs pickup/check-in and records condition, mileage, fuel, and evidence.
10. Rental remains active with possible extension, incident, support, or other events.
11. Staff performs return/check-out inspection.
12. System settles final charges, deposit/refund, and closes the rental.
13. Analytics and history preserve the business outcome.

## Product differentiators

- Strong agency operational control, not just online booking.
- A regional discovery layer that lets customers compare participating agencies/offers.
- Unified web/mobile operations backed by one authoritative domain model.
- Fleet profitability and utilization intelligence.
- First-class pickup/return inspection and damage evidence.
- Intelligent attention/exception center for owners and staff.
- Centralized availability and pricing engines.
- Multi-tenant SaaS design from day one.
- Arabic, French, and English support with RTL treated as first class.
- Algeria/Maghreb-ready monetary, location, and payment architecture without hard-coding a single provider.
- AI used for specific operational value: document extraction, damage comparison, forecasting, and decision support.

## Non-goals for initial release

The project should not attempt to solve every adjacent logistics or mobility problem. GPS/telematics, advanced automated dynamic pricing, external partner ecosystems, a dedicated customer mobile application, and deep AI automation should be architected for future support but only shipped when their prerequisites are stable.
