# Release 1 — Scope Matrix

## Purpose

This document is the authoritative product-scope matrix for Release 1. It separates what must ship for a credible pilot-ready marketplace/SaaS from capabilities intentionally deferred.

## Priority semantics

- **Must** — Release 1 blocker; required for pilot readiness or core integrity.
- **Should** — Release 1 target; may be sequenced after core foundations but should ship before broad launch when feasible.
- **Later** — architect now, implement after Release 1.
- **Future** — product option; do not add implementation unless explicitly scheduled.
- **Rejected** — deliberately excluded unless product strategy changes.

## Release 1 surfaces

| Surface | Release 1 | Purpose |
|---|---:|---|
| Customer Marketplace Web | Yes | Multi-agency discovery, comparison, booking, account/self-service |
| Agency Owner/Admin Web | Yes | Full agency management |
| Agency Operations Mobile App | Yes | Staff/owner field workflows |
| Platform Owner Web | Yes | SaaS, marketplace, monetization, moderation, support |
| Customer Mobile App | No | Release 2+ using the same APIs/domain |

## Marketplace & discovery

| Capability | Priority | Release | Beneficiaries | Reference/Reason |
|---|---|---|---|---|
| Search across participating agencies | Must | R1 | Customer | Core marketplace proposition |
| Search by city/wilaya/area | Must | R1 | Customer | Algeria/Maghreb |
| Search by branch/pickup point | Must | R1 | Customer | Core location workflow |
| Date/time availability search | Must | R1 | Customer | Booking integrity |
| Map + list results | Must | R1 | Customer | BookCars/Ipark/Autorockin |
| Nearby/within-distance search | Must | R1 | Customer | PostGIS + regional UX |
| Vehicle category/filtering | Must | R1 | Customer | Discovery |
| Price filtering | Must | R1 | Customer | Discovery |
| Transmission/fuel/features filters | Should | R1 | Customer | Search quality |
| Agency profile | Must | R1 | Customer/Agency | First-class marketplace entity |
| Agency verification badge/status | Should | R1 | Customer/Platform | Marketplace trust |
| Agency-only vehicle gallery | Must | R1 | Customer/Agency | Agency profile concept |
| Favorites | Should | R1 | Customer | Aggar pattern |
| Ranking by availability/distance/price/rating | Should | R1 | Customer/Agency | Transparent ranking |
| Sponsored/ads ranking manipulation | Rejected | - | - | Ads must not corrupt availability/trust ranking |
| SEO public pages | Should | R1 | Platform/Customer | Public marketplace acquisition |
| Accessibility baseline | Should | R1 | All | Public production quality |

## Agency operations

| Capability | Priority | Release | Beneficiaries |
|---|---|---|---|
| Agency onboarding | Must | R1 | Agency/Platform |
| Branch management | Must | R1 | Agency |
| Fleet/categories/vehicles | Must | R1 | Agency |
| Vehicle documents/expiry | Must | R1 | Agency |
| Vehicle images | Must | R1 | Agency |
| Vehicle mileage/fuel history | Must | R1 | Agency |
| Vehicle scheduler/timeline | Must | R1 | Agency/Staff |
| Manual booking | Must | R1 | Agency |
| Phone/walk-in booking | Must | R1 | Agency |
| Online marketplace booking | Must | R1 | Customer/Agency |
| Booking lifecycle | Must | R1 | All |
| Booking hold/timeout | Should | R1 | Customer/Agency |
| Cancellation/no-show | Must | R1 | Agency/Customer |
| Extension | Must | R1 | Customer/Agency |
| Vehicle reassignment | Should | R1 | Agency |
| Pickup checklist | Must | R1 | Staff |
| Return checklist | Must | R1 | Staff |
| QR booking/pickup workflow | Should | R1 | Staff/Customer |
| Staff tasks | Should | R1 | Staff |
| Preparation/readiness workflow | Should | R1 | Staff |
| Maintenance blocks | Must | R1 | Agency |
| Damage/accident blocks | Must | R1 | Agency |
| Manual availability blocks | Must | R1 | Agency |
| Transfer/reposition blocks | Should | R1 | Multi-branch agency |

## Pricing & commercial rental rules

| Capability | Priority | Release | Beneficiaries |
|---|---|---|---|
| Base rental rates | Must | R1 | Agency |
| Hour/day/week/month pricing | Must | R1 | Agency/Customer |
| Duration tiers | Must | R1 | Agency/Customer |
| Seasonal/special-date pricing | Must | R1 | Agency |
| Weekend/holiday rules | Should | R1 | Agency |
| Price groups/rate plans | Should | R1 | Agency |
| Extras/add-ons | Must | R1 | Agency/Customer |
| Delivery fee | Should | R1 | Agency/Customer |
| Distance-based fee | Should | R1 | Agency/Customer |
| After-hours fee | Should | R1 | Agency/Customer |
| One-way fee | Should | R1 | Agency/Customer |
| Deposit policy | Must | R1 | Agency |
| Promotions/coupons | Should | R1 | Agency/Customer |
| Transparent price breakdown | Must | R1 | Customer |
| Immutable commercial snapshot | Must | R1 | Agency/Platform |
| Smart pricing | Later | R2+ | Agency |

## Customer

| Capability | Priority | Release |
|---|---|---:|
| Customer account | Must | R1 |
| Phone/email verification | Must | R1 |
| Customer profile | Must | R1 |
| Rental history | Must | R1 |
| Document submission | Must | R1 |
| Booking management | Must | R1 |
| My Rental active context | Should | R1 |
| Extension request | Must | R1 |
| Support/contact agency | Should | R1 |
| Issue reporting with photos | Should | R1 |
| Favorites | Should | R1 |
| Customer mobile app | Later | R2+ |
| Loyalty | Later | R2+ |
| Referral program | Later | R2+ |

## Reviews, trust & communication

| Capability | Priority | Release | Notes |
|---|---|---:|---|
| Verified completed-rental review | Must | R1 | Prevent arbitrary reviews |
| Star rating | Must | R1 | Agency reputation |
| Written review/comment | Must | R1 | User requested |
| Agency reply | Should | R1 | Professional communication |
| Report review | Must | R1 | Moderation |
| Review moderation | Must | R1 | Platform owner |
| Customer reliability signal | Later | R2+ | Internal/risk-aware |
| Booking-linked messaging | Should | R1 | Aggar/operational need |
| File/photo messaging | Later | R2+ | Security/storage implications |
| Public social chat | Rejected | - | Not core to rental workflow |

## Maps & location

| Capability | Priority | Release |
|---|---|---:|
| PostGIS spatial storage/querying | Must | R1 |
| Branch map point | Must | R1 |
| Parking/pickup point | Must | R1 |
| Map/list switch | Must | R1 |
| Nearby search | Must | R1 |
| Address autocomplete | Should | R1 |
| Airport pickup | Should | R1 |
| Hotel/accommodation pickup | Should | R1 |
| Delivery zones | Should | R1 |
| Distance/route calculation adapter | Should | R1 |
| One-way route rules | Should | R1 |
| Live customer/vehicle location public display | Rejected | - | Privacy/safety |
| GPS telematics | Later | R3+ |

## Inspection, damage & maintenance

| Capability | Priority | Release |
|---|---|---:|
| Pickup inspection | Must | R1 |
| Return inspection | Must | R1 |
| Mileage capture | Must | R1 |
| Fuel capture | Must | R1 |
| Structured photo set | Must | R1 |
| Damage records/evidence | Must | R1 |
| Damage resolution/charge workflow | Must | R1 |
| Vehicle readiness state | Must | R1 |
| Maintenance records | Must | R1 |
| Preventive reminders | Must | R1 |
| Parts/cost tracking | Should | R1 |
| AI damage comparison | Later | R3+ |
| AI liability decision | Rejected | - | AI must not be sole liability authority |

## Documents & contracts

| Capability | Priority | Release |
|---|---|---:|
| Rental contract record | Must | R1 |
| Versioned templates | Must | R1 |
| Arabic/French/English contract templates | Must | R1 |
| PDF generation | Must | R1 |
| Digital signature workflow | Should | R1 |
| Signed document preservation | Must | R1 |
| Customer/vehicle document expiry | Must | R1 |

## Payments & billing

| Capability | Priority | Release | Notes |
|---|---|---:|---|
| Cash payment | Must | R1 | Algeria/Maghreb |
| Bank transfer | Must | R1 | Agency/customer + agency/platform contexts |
| Manual payment recording | Must | R1 | Auditable |
| Partial payment | Must | R1 | Balance tracking |
| Deposit lifecycle | Must | R1 | Separate from revenue |
| Refund/adjustment records | Must | R1 | Append-oriented |
| Customer online payment | Later | R2+ | Provider dependent |
| Chargily adapter | Later | R2+ | Evaluate current commercial/technical prerequisites |
| Payment provider abstraction | Must | R1 | Prevent vendor lock-in |
| Webhook reconciliation | Must | R1 | Future-proof provider integration |

## SaaS / monetization / platform owner

| Capability | Priority | Release |
|---|---|---:|
| Free plan | Must | R1 |
| Configurable trial | Must | R1 |
| Paid subscription | Must | R1 |
| License keys | Should | R1 |
| Manual renewal | Must | R1 |
| Entitlements | Must | R1 |
| Feature flags | Should | R1 |
| Google Ads configuration | Should | R1 |
| Marketplace commission configuration | Should | R1 |
| Combined/hybrid monetization | Must | R1 |
| Platform billing audit | Must | R1 |
| Chargily subscription payments | Later | R2+ |
| Ad performance/revenue dashboard | Later | R2+ |

## Localization

| Capability | Priority | Release |
|---|---|---:|
| English | Must | R1 |
| French | Must | R1 |
| Arabic | Must | R1 |
| Full RTL | Must | R1 |
| DZD | Must | R1 |
| EUR/MAD/TND architecture | Should | R1 |
| Locale-aware dates/numbers/currency | Must | R1 |
| Per-tenant default locale | Should | R1 |

## Analytics & intelligence

| Capability | Priority | Release |
|---|---|---:|
| Revenue | Must | R1 |
| Outstanding balances | Must | R1 |
| Fleet utilization | Must | R1 |
| Vehicle profitability | Should | R1 |
| Branch performance | Should | R1 |
| Booking conversion | Should | R1 |
| Attention/exception center | Should | R1 |
| Demand heatmaps | Later | R2+ |
| AI business assistant | Later | R3+ |
| AI document extraction | Later | R3+ |
| Smart pricing recommendations | Later | R3+ |

## Platform safety & quality

| Capability | Priority | Release |
|---|---|---:|
| Tenant isolation | Must | R1 |
| RBAC/permissions | Must | R1 |
| Audit events | Must | R1 |
| Rate limiting | Must | R1 |
| Secure document/media access | Must | R1 |
| Structured logs | Must | R1 |
| Error monitoring | Must | R1 |
| Unit/integration/E2E tests | Must | R1 |
| Migration checks | Must | R1 |
| Backup/restore verification | Must | R1 |
| Performance/load baseline | Should | R1 |
| Disaster recovery runbook | Should | R1 |

## Release 1 success gate

Release 1 is not considered pilot-ready until at least one real agency can complete the complete operational loop:

```text
Agency onboarding
→ add branch/location
→ add vehicle + documents/photos
→ configure pricing/policies
→ customer searches marketplace
→ customer sees agency offer
→ booking created
→ booking confirmed without conflict
→ staff receives/works task
→ QR/check-in workflow
→ pickup inspection
→ active rental
→ extension or issue path
→ return inspection
→ damage/settlement where applicable
→ final payment/deposit handling
→ booking completion
→ customer review
→ agency operational history/reporting
```

The same environment must also demonstrate tenant isolation, auditability, failure/retry safety, and restore/recovery procedures.
