# 05 — Feature Matrix

Priority meanings:
- **Must** = required for a credible production MVP.
- **Should** = strongly recommended for the first production release.
- **Pro** = advanced differentiator; architecture should allow it without forcing MVP complexity.
- **Later** = intentionally deferred; do not block core architecture, but avoid designs that make it impossible later.

| Domain | Capability | Priority | Notes |
|---|---|---|---|
| Identity | Customer authentication | Must | Web + mobile |
| Identity | Staff/owner authentication | Must | Privileged surface |
| Identity | Email/phone verification | Must | Configurable by market |
| Identity | Password reset/session security | Must | Secure defaults |
| Identity | RBAC | Must | Server enforced |
| Tenant | Agency/tenant | Must | SaaS foundation |
| Tenant | Branches | Must | Multi-branch ready |
| Tenant | Tenant isolation | Must | Every tenant-owned query/resource |
| Fleet | Vehicle categories | Must | Pricing/availability grouping |
| Fleet | Vehicles | Must | Full lifecycle record |
| Fleet | Vehicle documents | Must | Expiry tracking |
| Fleet | Mileage/odometer | Must | Pickup/return + history |
| Fleet | Fuel tracking | Must | Configurable policy |
| Fleet | Operational status | Must | Derived from events/blocks |
| Fleet | Vehicle profitability | Should | Revenue/cost view |
| Fleet | Vehicle health score | Pro | Maintenance/inspection-derived |
| Availability | Conflict detection | Must | Server authoritative |
| Availability | Vehicle scheduler/timeline | Must | Owner/staff UX |
| Availability | Maintenance blocks | Must | Prevent incompatible booking |
| Availability | Inspection/readiness blocks | Must | Prevent premature availability |
| Availability | Damage/accident blocks | Must | Operational safety |
| Availability | Manual blocks | Must | Owner controlled |
| Availability | Transfer/reposition blocks | Should | Multi-branch/different return locations |
| Booking | Online booking | Must | Customer web/mobile |
| Booking | Manual booking | Must | Staff/owner |
| Booking | Walk-in/phone booking | Must | Same booking engine |
| Booking | Booking lifecycle | Must | Explicit state machine |
| Booking | Hold/temporary reservation | Should | Time-limited inventory hold |
| Booking | Extension | Must | Availability rechecked |
| Booking | Cancellation | Must | Policy driven |
| Booking | No-show | Should | Policy driven |
| Booking | Reassignment | Should | Audited vehicle reassignment |
| Booking | Historical snapshots | Must | Price/booking truth |
| Booking | QR booking lookup | Should | Fast staff workflow |
| Pricing | Base rates | Must | Configurable |
| Pricing | Hour/day/week/month rates | Must | Configurable by agency |
| Pricing | Duration tiers | Must | Long-rental pricing |
| Pricing | Seasonal/date rules | Must | Effective dates |
| Pricing | Weekend/holiday rules | Should | Market configurable |
| Pricing | Discounts/promotions | Should | Coupon/promo engine |
| Pricing | Extras/add-ons | Must | Child seat, delivery, etc. as configured |
| Pricing | One-way/location fees | Should | Pickup/drop-off rules |
| Pricing | Price explanation | Must | Transparent breakdown |
| Pricing | Smart pricing suggestions | Pro | Data-grounded |
| Customer | Customer profile | Must | Documents + history |
| Customer | Customer portal | Must | Self-service |
| Customer | My Rental | Should | Active rental context |
| Customer | Saved preferences | Should | Faster booking |
| Customer | Issue reporting | Should | Photos + support |
| Customer | Loyalty | Later | Retention |
| Customer | Referral | Later | Acquisition |
| Map | Map/list search | Must | First-class discovery |
| Map | Hierarchical locations | Must | Country/region/city/branch |
| Map | Address autocomplete | Should | Provider abstraction |
| Map | Branch/parking pins | Must | Pickup discovery |
| Map | Airport/hotel pickup points | Should | Regional travel use cases |
| Map | Delivery zones | Should | Configurable by agency |
| Map | One-way route support | Should | Different pickup/return |
| Contracts | Rental contract | Must | Digital record |
| Contracts | Contract templates | Must | Versioned |
| Contracts | Digital signature | Should | Legal/operational requirements vary |
| Contracts | PDF contract/receipt | Must | Print/share |
| Contracts | Localized contract language | Must | Arabic/French/English |
| Inspection | Pickup inspection | Must | Photos + checklist |
| Inspection | Return inspection | Must | Compare with pickup |
| Inspection | Damage records | Must | Evidence + responsibility workflow |
| Inspection | Structured vehicle photo set | Must | Front/rear/sides/interior etc. |
| Inspection | AI comparison | Pro | Human confirmation required |
| Maintenance | Service records | Must | Scheduling/reminders |
| Maintenance | Parts/cost records | Should | Total operating cost |
| Maintenance | Readiness workflow | Should | Clean/inspect/refuel |
| Maintenance | Preventive reminders | Must | Mileage/date driven |
| Documents | Expiry center | Must | Insurance/inspection/registration |
| Payments | Payment records | Must | Immutable transaction history |
| Payments | Deposit | Must | Policy driven |
| Payments | Partial payment | Must | Balance tracking |
| Payments | Refund | Must | Controlled/audited |
| Payments | Cash | Must | Important regional method |
| Payments | Bank transfer | Must | Reconciliation workflow |
| Payments | Online card provider abstraction | Must | Provider-neutral |
| Payments | Local Algeria gateway adapter | Pro | Subject to merchant/provider availability and certification |
| Payments | Payment webhook reconciliation | Must | Never trust client status |
| Billing | Invoices/receipts | Must | Historical documents |
| Billing | Financial adjustments | Must | Auditable |
| Notifications | In-app | Must | Central event system |
| Notifications | Push | Should | Mobile |
| Notifications | Email | Should | Provider adapter |
| Notifications | SMS adapter | Pro | Provider dependent |
| Notifications | WhatsApp adapter | Pro | Provider/business dependent |
| Operations | Staff tasks | Should | Pickup/return/preparation |
| Operations | QR workflow | Should | Fast operational start |
| Operations | Preparation checklist | Should | Readiness |
| Partners | Partner tracking | Later | Hotels/travel partners |
| Partners | Partner commissions | Later | Configurable |
| Analytics | Revenue | Must | Owner reporting |
| Analytics | Outstanding balances | Must | Finance visibility |
| Analytics | Utilization | Must | Fleet performance |
| Analytics | Vehicle profitability | Should | Revenue minus allocated costs |
| Analytics | Branch performance | Should | Multi-branch |
| Analytics | Booking conversion | Should | Web funnel |
| Analytics | Demand heatmap | Pro | Map/time based |
| Analytics | Attention center | Should | Exception-first operations |
| AI | Business assistant | Pro | Authorized data only |
| AI | Document extraction | Pro | Human verification |
| AI | Damage assistance | Pro | Never sole liability decision |
| AI | Pricing recommendations | Pro | Recommendation, not autonomous override |
| GPS | Telematics integration | Later/Pro | Hardware/provider dependent |
| Localization | Arabic | Must | Full RTL |
| Localization | French | Must | |
| Localization | English | Must | |
| Localization | DZD | Must | Primary market |
| Localization | MAD/TND/EUR etc. | Should | Currency abstraction |
| Localization | Locale-aware formats | Must | Dates/numbers/amounts |
| Security | Audit log | Must | Critical actions |
| Security | Rate limiting/abuse protection | Must | Public APIs |
| Security | Tenant isolation | Must | Critical |
| Security | Secure file access | Must | Customer/vehicle documents |
| Security | Secret management | Must | Never commit secrets |
| Security | Security headers/input hardening | Must | OWASP-oriented |
| Quality | Unit tests | Must | Domain rules |
| Quality | Integration tests | Must | API/DB workflows |
| Quality | E2E tests | Must | Critical journeys |
| Quality | Load/performance tests | Should | Critical APIs |
| Quality | Migration/backward compatibility checks | Must | Production safety |
| Observability | Structured logs | Must | Correlation IDs |
| Observability | Error monitoring | Must | Provider-neutral integration |
| Observability | Metrics/tracing | Should | Critical flows |
