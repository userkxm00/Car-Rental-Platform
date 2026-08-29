# 05 — Release 1 Scope Matrix

## Purpose

This is the authoritative delivery scope for Release 1. The full product may contain future/pro features, but the Release 1 implementation must remain focused enough to validate the product with real agencies and customers.

## Priority meanings

- **P0 — Must ship:** required for pilot/production credibility.
- **P1 — Should ship:** high-value and strongly recommended when prerequisites are stable.
- **P2 — Future-ready:** architecture supports it, but Release 1 does not implement the full feature.
- **P3 — Deferred:** intentionally excluded until later validation.

## Release 1 surfaces

### Customer Web

| Capability | Priority | User value | Dependency / note |
|---|---|---|---|
| Marketplace home/search | P0 | Discover cars across participating agencies | Availability + locations |
| Map/List results | P0 | Find nearby agencies/cars visually | PostGIS + map provider adapter |
| Advanced filters | P0 | Narrow by price/category/features/location | Search API |
| Agency profile pages | P0 | Trust + direct discovery | Agency publishing |
| Agency-only vehicle listings | P0 | See inventory belonging to that agency | Tenant isolation |
| Vehicle detail page | P0 | Understand car before booking | Media + pricing |
| Availability display | P0 | Avoid false offers | Availability engine |
| Transparent price breakdown | P0 | Trust and fewer disputes | Pricing engine |
| Booking creation | P0 | Core conversion | Booking engine |
| Manual/offline payment selection | P0 | Fits regional payment habits | Payment records |
| Customer account/portal | P0 | View bookings/documents | Auth |
| Booking status/history | P0 | Self-service | Booking lifecycle |
| Notifications center | P1 | Keep customer informed | Events |
| Favorites | P1 | Faster repeat booking | Customer profile |
| Issue/support request | P1 | Reduce phone friction | Operations/support |
| Reviews/comments | P1 | Marketplace trust | Completed-rental eligibility |
| Agency response to review | P1 | Fair communication | Moderation |
| SEO/public structured data | P1 | Organic discovery | Public web |
| Accessibility baseline | P1 | Usable public platform | Design system |
| PWA installability | P2 | App-like web option | Evaluate after pilot |

### Agency Web

| Capability | Priority | User value |
|---|---|---|
| Dashboard + attention center | P0 | Know what needs action |
| Agency profile/branding | P0 | Control marketplace presence |
| Branches/locations | P0 | Manage operations |
| Fleet management | P0 | Manage inventory |
| Vehicle categories | P0 | Pricing/search structure |
| Vehicle documents/expiry | P0 | Compliance awareness |
| Vehicle media/gallery | P0 | Better listings/evidence |
| Pricing/rate plans | P0 | Revenue control |
| Availability calendar/scheduler | P0 | Prevent conflicts |
| Reservations/bookings | P0 | Core business workflow |
| Manual/phone/walk-in bookings | P0 | Support real-world sales |
| Customer management | P0 | Customer history |
| Contracts/PDFs | P0 | Operational/legal record |
| Pickup/return workflow supervision | P0 | Fleet turnover |
| Inspection/damage management | P0 | Evidence and dispute handling |
| Maintenance | P0 | Vehicle readiness |
| Payments/deposits/balance | P0 | Financial control |
| Basic revenue/utilization reports | P0 | Business visibility |
| Staff/users/roles | P0 | Secure delegation |
| Notifications/settings | P1 | Operational polish |
| Vehicle profitability | P1 | Better fleet decisions |
| Branch performance | P1 | Multi-branch visibility |
| Customer reliability signal | P2 | Future risk tooling |
| Advanced analytics | P2 | Future expansion |

### Agency Operations Mobile App

| Capability | Priority | User value |
|---|---|---|
| Secure staff/owner login | P0 | Safe mobile operations |
| Today dashboard/tasks | P0 | Fast daily execution |
| Pickup checklist | P0 | Standardized handover |
| Return checklist | P0 | Standardized return |
| QR booking lookup | P0 | Fast customer/booking lookup |
| Customer verification workflow | P0 | Correct renter matching |
| Mileage capture | P0 | Accurate rental record |
| Fuel capture | P0 | Accurate settlement |
| Vehicle condition checklist | P0 | Evidence |
| Camera/photos | P0 | Damage/condition evidence |
| Vehicle readiness status | P0 | Quick turnaround |
| Push notifications | P1 | Time-sensitive tasks |
| GPS/location-assisted workflow | P1 | Pickup coordination; no public live tracking |
| Offline-safe draft/checklist support | P1 | Resilience in weak connectivity | Must never bypass server authority |
| Full owner analytics | P2 | Keep mobile focused |

### Platform Owner Web

| Capability | Priority | User value |
|---|---|---|
| Agency onboarding/verification | P0 | Marketplace trust |
| Tenant lifecycle | P0 | SaaS administration |
| Plans | P0 | Monetization |
| Trials | P0 | Acquisition |
| Subscriptions | P0 | Monetization |
| License keys | P0 | Manual sales/activation |
| Manual renewal/payment recording | P0 | Regional business model |
| Entitlement engine | P0 | Feature/capacity control |
| Feature flags | P1 | Controlled rollouts |
| Marketplace moderation | P0 | Safety/trust |
| Review moderation | P1 | Abuse control |
| Support/dispute controls | P1 | Platform operations |
| Google Ads configuration | P1 | Optional ad revenue on eligible public surfaces |
| Marketplace commission configuration | P1 | Optional future revenue |
| Chargily adapter configuration | P2 | Future online payments |
| Platform analytics | P1 | Business oversight |
| Audit logs | P0 | Accountability |

## Release 1 commercial configuration

The architecture supports simultaneous independent mechanisms. A particular deployment can enable any combination without code changes to the core rental domain.

Supported mechanisms:

- Free
- Trial (configurable, initial default may be 30 days)
- Paid subscription
- License Key
- Manual renewal/offline payment recording
- Google Ads on selected public surfaces
- Marketplace commission, if enabled
- Future Chargily/local online payment adapter

This is not a requirement to activate every mechanism at launch.

## Release 1 payment policy

Customer-to-agency payment methods should prioritize practical regional workflows:

- Cash
- Bank transfer
- Pay at agency/counter
- Manual payment confirmation
- Deposit handling

Online gateway integration is provider-neutral and may be enabled later after commercial and compliance prerequisites are met.

## Release 1 localization

Required:

- Arabic
- French
- English
- Full Arabic RTL
- DZD primary currency
- Centralized date/number/currency formatting
- Architecture for MAD/TND/EUR and additional locales

## Release 1 map capability

Mandatory because it is central to marketplace discovery:

- Map/List toggle
- Search by city/wilaya/area
- Nearby agencies
- Branch and pickup points
- Airport/hotel pickup where configured
- Delivery zones
- Pickup/return location selection
- Distance-aware results and fees
- Map provider abstraction
- PostGIS-backed canonical geographic storage

## Release 1 trust model

Marketplace offers must expose enough context for informed choice:

- agency identity
- verified status where applicable
- rating/review summary when enough evidence exists
- vehicle details
- clear price components
- pickup/return rules
- important policies
- availability state

## Explicit Release 1 exclusions

Do not block Release 1 on:

- dedicated customer mobile app
- advanced autonomous AI
- automated dynamic pricing
- live telematics/GPS fleet tracking
- loyalty program
- full referral/partner ecosystem
- complex wallet/cashback
- deep external accounting integrations
- full insurance marketplace
- multi-country specialization beyond architecture/localization readiness

These remain architected for future phases when justified by pilot/customer evidence.

## Scope control rule

A feature not listed in Release 1 scope must not be added to the implementation merely because a reference repository contains it. New scope requires an explicit product decision and documentation update.

## Pilot success gate

Release 1 should not be declared generally production-ready until a real agency can complete, using the system end-to-end:

1. Configure agency/profile/branch.
2. Add vehicles and pricing.
3. Publish inventory.
4. Receive a marketplace search/customer booking.
5. Confirm/prepare vehicle.
6. Perform pickup with mobile workflow.
7. Run active rental.
8. Complete return/inspection.
9. Record payment/deposit/settlement.
10. Produce documents/reports.
11. Handle a review/support case.
12. Recover from a failed/duplicate/retried request without corrupting business truth.
