# 05 — Feature Matrix

This matrix is a planning baseline. Detailed specifications will be added per domain before implementation.

| Domain | Capability | Priority | Notes |
|---|---|---|---|
| Identity | Customer authentication | Must | Web + mobile |
| Identity | Staff/owner authentication | Must | Separate privileged surface |
| Identity | RBAC | Must | Server enforced |
| Tenant | Agency/tenant | Must | SaaS foundation |
| Tenant | Branches | Must | Multi-branch ready |
| Fleet | Vehicle categories | Must | Pricing/availability grouping |
| Fleet | Vehicles | Must | Full lifecycle record |
| Fleet | Vehicle documents | Must | Expiry tracking |
| Fleet | Mileage/fuel | Must | Pickup/return facts |
| Fleet | Operational status | Must | Derived/commanded state, not a single boolean availability source |
| Availability | Conflict detection | Must | Server authoritative |
| Availability | Timeline/scheduler | Must | Owner/staff UX |
| Availability | Maintenance blocks | Must | Prevent booking |
| Availability | Manual blocks | Must | Prevent booking |
| Booking | Online booking | Must | Customer web/mobile |
| Booking | Manual booking | Must | Staff/owner |
| Booking | Booking lifecycle | Must | Explicit state machine |
| Booking | Extension | Must | Availability checked again |
| Booking | Cancellation | Must | Policy driven |
| Booking | Historical snapshots | Must | Price/booking truth |
| Pricing | Base rates | Must | Configurable |
| Pricing | Duration pricing | Must | Hour/day/week/month as applicable |
| Pricing | Seasonal/date rules | Must | Configurable |
| Pricing | Discounts/promotions | Should | Phase depends on MVP scope |
| Pricing | Smart pricing suggestions | Later/Pro | AI/data dependent |
| Customer | Customer profile | Must | Documents + history |
| Customer | Customer portal | Must | Self-service |
| Customer | My Rental | Should | Live rental context |
| Customer | Issue reporting | Should | Photos + support |
| Contract | Rental contract | Must | Digital record |
| Contract | Digital signature | Should | Depends on legal/operational requirements |
| Inspection | Pickup inspection | Must | Photos + checklist |
| Inspection | Return inspection | Must | Compare with pickup |
| Damage | Damage records | Must | Evidence + responsibility |
| Damage | AI comparison | Pro | Human confirmation required |
| Maintenance | Service records | Must | Scheduling/reminders |
| Maintenance | Readiness workflow | Should | Prepare/clean/inspect |
| Payments | Payment records | Must | Immutable transaction history |
| Payments | Deposit | Must | Policy driven |
| Payments | Refund | Must | Controlled/audited |
| Payments | Provider abstraction | Must | Avoid hard-coupling product to one gateway |
| Billing | Invoices/receipts | Must | Historical documents |
| Notifications | In-app | Must | Central event system |
| Notifications | Push | Should | Mobile |
| Notifications | Email | Should | Provider adapter |
| Operations | Staff tasks | Should | Pickup/return/preparation |
| Operations | QR booking lookup | Should | Fast staff workflow |
| Partners | Partner tracking | Later | Hotels/travel partners |
| Loyalty | Loyalty | Later | Retention |
| Referral | Referral tracking | Later | Acquisition |
| Analytics | Revenue | Must | Owner reporting |
| Analytics | Utilization | Must | Fleet performance |
| Analytics | Vehicle profitability | Should | Revenue minus allocated expenses |
| Analytics | Attention center | Should | Exception-first operations |
| AI | Business assistant | Pro | Data-grounded only |
| AI | Document extraction | Pro | Human verification |
| GPS | Telematics | Later/Pro | Hardware/provider dependent |
| Localization | Arabic | Must | RTL |
| Localization | French | Must | |
| Localization | English | Must | |
| Localization | DZD | Must | Primary market support |
| Security | Audit log | Must | Critical actions |
| Security | Rate limiting/abuse protection | Must | Public APIs |
| Security | Tenant isolation | Must | Critical |
| Quality | Unit/integration tests | Must | Critical domains |
| Quality | E2E tests | Must | Critical journeys |
