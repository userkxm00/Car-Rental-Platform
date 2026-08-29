# 40 — Marketplace & Agency Profiles

## Product decision

Car Rental Platform is both:

1. A multi-tenant SaaS operating system for rental agencies.
2. A regional marketplace where customers can discover offers from multiple participating agencies.

The marketplace is a platform-level discovery layer. Each agency remains the owner/operator of its own vehicles, prices, policies, bookings and customer relationships.

## Customer discovery journey

Customer enters the website and specifies:
- pickup location
- return location
- pickup date/time
- return date/time
- optional vehicle category
- optional filters

The platform searches participating agencies and returns only offers that are actually bookable for the requested context.

Example:

```text
Oran — 10 Sep → 15 Sep

Agency A — Renault Clio — 4,500 DZD/day
Agency B — Peugeot 208 — 4,800 DZD/day
Agency C — Seat Ibiza — 4,300 DZD/day
```

Customer can compare and choose the offer that fits best.

## Marketplace boundaries

The platform must never pretend that marketplace inventory is one physical fleet.

Every offer has an explicit:
- tenant/agency
- vehicle or vehicle category
- branch/pickup context
- pricing policy/snapshot
- availability result
- cancellation/other policy summary

The agency remains operationally responsible for fulfilling the booking.

## Agency profile

Every participating agency has a first-class public profile.

Profile may include:
- agency name
- logo
- cover image
- short description
- verified status
- rating summary
- review count
- service areas
- branches
- map/location information
- opening hours
- pickup/drop-off methods
- supported languages
- contact methods
- policies
- fleet categories
- currently bookable vehicles/offers
- photos
- response/reliability indicators where permitted

The profile is localized in Arabic, French and English where translations exist.

## Agency fleet page

An agency profile can expose a dedicated fleet view showing that agency's bookable inventory only.

```text
Agency Profile
  ├── About
  ├── Locations
  ├── Reviews
  ├── Policies
  └── Available Cars
```

Do not expose exact live vehicle locations by default.

## Search and ranking

Marketplace ranking must not be a simple pay-to-win list.

Ranking may consider:
- exact availability
- requested location fit
- price relevance
- distance
- verified agency status
- review quality/volume with anti-manipulation controls
- response reliability
- cancellation reliability
- fleet suitability
- policy fit

Sponsored placement, if introduced, must be explicitly labeled and must not corrupt hard eligibility filters.

## Map/list experience

Marketplace search must provide:
- split map/list on larger screens
- map/list toggle on mobile web
- clustered pins where dense
- search-this-area behavior
- branch and pickup locations
- distance information
- directions
- delivery/service-zone information where enabled

The location model uses PostGIS and provider abstraction as defined by the map architecture.

## Marketplace booking ownership

A marketplace booking must retain:
- marketplace channel metadata
- agency/tenant
- customer
- offer snapshot
- price snapshot
- pickup/return context
- applicable platform commission/fee if any
- customer communication/audit trail

The booking then enters the same authoritative agency booking lifecycle used for direct/manual bookings.

## Platform commission — future option

The architecture should support a future marketplace revenue model such as:
- agency SaaS subscription only
- booking commission
- hybrid SaaS + booking commission
- promoted placement/advertising

The platform owner chooses the active model through platform configuration. This decision must not be hard-coded into booking logic.

## Reviews

Only eligible users with a completed/qualifying booking should be allowed to submit an agency review, subject to policy.

Review model should support:
- rating score
- written comment
- booking/experience reference
- creation/moderation state
- agency response
- report/moderation workflow

Prevent duplicate or obviously fraudulent review submissions.

## Customer reputation — future/private

Agency-side customer signals may be supported later, but must be access-controlled and not automatically exposed as a public customer score without explicit product/legal review.

## Regional strategy

Release 1 should prioritize Algeria and nearby North African workflows while keeping the domain model general enough for Morocco, Tunisia and other markets.

Regional configuration should support:
- DZD primary currency
- MAD/TND/EUR/USD-ready currency model
- Arabic RTL
- French
- English
- local address patterns
- local contact formats
- manual/cash/bank-transfer workflows
- future local payment provider adapters

## Reference lessons

BookCars demonstrates multi-supplier inventory, location-aware search, booking, scheduling, pricing, maps and parking capabilities.

Autorockin demonstrates the regional value of Arabic/French/English, map search, address autocomplete, structured vehicle imagery and transparency-oriented marketplace ideas.

Renta demonstrates QR confirmation, owner dashboards, PostgreSQL-oriented full-stack architecture and future location tracking.

WordPress Car Rental System demonstrates useful marketplace/search concepts such as individual location pages, customer reviews, partner roles, multiple location fees, season/day/hour pricing, coupons and deposits.

These are references, not implementations to copy.
