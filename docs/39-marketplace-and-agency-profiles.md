# 39 — Marketplace, Agency Profiles & Trust

## Purpose

Define the customer-facing marketplace layer that connects customers with participating car-rental agencies while preserving each agency's operational ownership and autonomy.

## Core model

The platform has two related products:

1. Agency SaaS — a private operating system for each agency.
2. Marketplace — a public discovery and booking layer across participating agencies.

A marketplace result must always identify the agency responsible for the offer. The platform does not imply shared fleet ownership.

## Customer search

Customers can search by:

- country / region / wilaya
- city / area
- branch
- airport
- hotel/accommodation
- map location
- pickup date/time
- return date/time
- return location
- vehicle category
- transmission
- fuel type
- seats
- features
- price range
- agency verification/rating where applicable

Search results must come from the authoritative availability and pricing engines.

## Map-first discovery

Map and list views are first-class and synchronized.

Customer can:

- browse agencies/vehicles on a map
- select a map pin to preview an agency/offer
- filter the map
- switch between map and list
- use current/selected location when permission is granted
- choose branch/pickup location
- view distance to pickup location
- use supported directions/deep links

The map is a discovery and operational context tool, not merely decoration.

## Agency profile

Every participating agency may have a public profile, subject to verification and marketplace eligibility.

Profile contains:

- agency name and logo
- verification status/badge
- description
- photos where enabled
- rating summary and reviews
- branch/location list
- opening hours
- pickup/drop-off options
- supported languages
- payment methods accepted by the agency
- rental policies
- cancellation policy
- fleet currently published to marketplace
- contact/support options
- response/reliability signals where justified

The agency profile shows that agency's own marketplace-visible vehicles only.

## Vehicle offer page

A vehicle offer must identify:

- agency
- vehicle/category
- relevant availability
- pickup/return location
- base rental price
- meaningful extras/fees
- deposit separately
- applicable taxes/charges where required
- cancellation terms
- important mileage/fuel conditions
- booking requirements

No hidden customer charges should be introduced late in the flow except unavoidable legally/provider-required items.

## Agency marketplace controls

Agency can configure whether its profile and individual vehicles are visible in marketplace, subject to platform eligibility.

Agency controls include:

- publish/unpublish profile
- publish/unpublish vehicle listings
- marketplace-specific description/media
- marketplace availability participation
- pickup locations
- delivery zones
- public contact preferences
- public policies

Platform may suspend or restrict marketplace visibility independently of the agency's private SaaS data.

## Verification

Marketplace must support agency verification levels, for example:

- Unverified
- Pending verification
- Verified
- Restricted
- Suspended

Exact criteria will be defined by platform operations and applicable legal requirements.

A verification badge must have a clear meaning and should not imply a guarantee beyond the documented verification scope.

## Ranking

Ranking must be configurable and auditable.

Useful signals may include:

- exact availability
- requested pickup proximity
- price relevance
- agency response/reliability
- verified status
- customer rating
- policy fit
- listing quality/completeness

Sponsored placement, if enabled, must be clearly labeled and must not fabricate availability or override safety/compliance rules.

## Reviews and comments

Reviews are primarily experience-based.

Eligibility should normally require a completed/eligible booking relationship or another explicit verified relationship.

A review can contain:

- rating
- comment
- creation date
- verified-experience indicator
- optional agency response

Moderation controls:

- report review
- hide/remove according to documented policy
- abuse/spam detection
- audit history
- rate limits

Reviews should not be editable in ways that erase the original moderation/audit history.

## Customer-to-agency trust

The platform may later expose customer-facing trust signals such as:

- verified agency
- response time
- fulfillment rate
- cancellation history where meaningful
- review quality/volume

Avoid presenting raw internal risk scores as public facts without a documented policy.

## Agency-to-customer feedback

Agencies may record a private customer reliability signal based on actual rental interactions.

It is not a public blacklist by default.

Potential inputs:

- completed rentals
- payment/settlement behavior
- late returns
- verified damage/dispute outcomes
- documented no-shows

Access is tenant-scoped and subject to policy/legal review.

## Marketplace booking ownership

When a customer selects an agency offer:

- the offer belongs to the agency tenant
- agency pricing/policies apply
- the agency remains operationally responsible for the rental
- the platform records the marketplace channel
- platform-level commissions, if enabled, are recorded separately from agency revenue

The booking engine remains shared with direct agency bookings.

## Future marketplace monetization

The marketplace may support configurable platform monetization such as:

- booking commission
- promoted/sponsored placement
- subscription tiers
- lead/booking fees
- value-added services
- advertising

No monetization method should alter authoritative availability or financial records.
