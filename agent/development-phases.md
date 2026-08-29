# Development Phases

The implementation is intentionally staged. Do not ask an agent to build the entire platform in one pass.

## Phase 00 — Foundation

- repository conventions
- documentation structure
- CI baseline
- environment/configuration strategy
- selected stack and architecture ADRs
- observability baseline

## Phase 01 — Identity and Access

- authentication
- sessions/tokens
- user profile
- roles and permissions
- platform administrator vs agency users

## Phase 02 — Multi-Tenancy and Organization

- agencies/tenants
- branches
- locations
- tenant isolation
- staff membership
- organization settings

## Phase 03 — Fleet Foundation

- vehicle categories
- vehicles
- status model
- mileage/fuel data
- vehicle documents
- operational blocks

## Phase 04 — Availability Engine

- reservation intervals
- operational blocking intervals
- conflict detection
- scheduler/timeline
- branch/location constraints
- availability APIs

## Phase 05 — Booking Engine

- quote creation
- reservation lifecycle
- confirmation/cancellation
- extensions
- manual/walk-in booking
- booking snapshots
- idempotency and concurrency protection

## Phase 06 — Pricing Engine

- base rates
- duration rates
- seasonal/special-date rules
- discounts/promotions
- extras/fees
- deposit
- server-side calculation
- historical price snapshots

## Phase 07 — Customer Platform

- customer profile
- search/filter
- vehicle details
- quote/checkout
- reservation portal
- documents
- rental lifecycle
- support

## Phase 08 — Contracts and Documents

- rental agreement
- document requirements
- digital signature workflow
- generated receipts/PDFs
- document storage/access controls

## Phase 09 — Payments and Billing

- payment intents/records
- deposits
- partial/full payment
- refunds
- outstanding balances
- invoices
- provider abstraction
- webhook reconciliation

## Phase 10 — Inspection and Damage

- pickup inspection
- return inspection
- photos/evidence
- condition checklist
- damage records
- settlement workflow
- audit trail

## Phase 11 — Maintenance and Vehicle Readiness

- service schedules
- maintenance records
- maintenance blocks
- readiness state
- insurance/registration/inspection reminders

## Phase 12 — Owner Operations Dashboard

- KPI dashboard
- attention/exception center
- calendar
- fleet intelligence
- revenue/profitability
- utilization
- operational reports

## Phase 13 — Staff Mobile Operations

- daily tasks
- pickup workflow
- return workflow
- inspection capture
- QR lookup
- customer handoff
- issue reporting

## Phase 14 — Customer Mobile App

- login/profile
- search/booking
- reservation management
- digital check-in
- QR pickup
- my rental
- extension
- support
- notifications

## Phase 15 — Notifications and Automation

- event-driven notifications
- push
- email adapter
- reminders
- overdue flows
- scheduled jobs

## Phase 16 — Partners, Loyalty, Referrals

- partner codes/QRs
- referral tracking
- loyalty rules
- commissions

## Phase 17 — Analytics and AI Assistance

- business analytics
- utilization forecasting
- profitability insights
- document extraction
- inspection/damage comparison
- owner decision support

## Phase 18 — Security Hardening and Reliability

- security review
- tenant isolation tests
- abuse/rate-limit review
- permission matrix verification
- backups/recovery
- observability
- performance checks

## Phase 19 — Production Readiness

- E2E coverage of critical journeys
- migration rehearsal
- deployment verification
- mobile release preparation
- operational runbooks
- Definition of Done audit
