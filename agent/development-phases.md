# Development Phases

The implementation is intentionally staged. Do not ask an agent to build the entire platform in one pass.

## Phase completion gate

A phase is complete only when:
- Scope is implemented.
- Relevant business rules are documented.
- Database/migrations are reviewed.
- Authorization is reviewed.
- API behavior is validated.
- Critical error paths are handled.
- Automated tests pass.
- Type/lint/build checks pass.
- Documentation is updated.
- No known critical security defect remains.
- The phase acceptance criteria are demonstrably satisfied.

## Phase 00 — Foundation & Architecture

**Status: FROZEN — Release 1 Core Architecture**

- repository conventions
- documentation structure
- CI baseline
- environment/configuration strategy
- selected stack and architecture ADRs
- observability baseline
- design system/i18n foundations
- Release 1 scope matrix
- database/domain architecture
- booking/availability/pricing architecture
- security and tenancy baseline
- marketplace/SaaS/monetization model

Gate: architecture freeze document is approved; repository guidance is authoritative; no critical architectural decision remains open.

Any material change after freeze requires an ADR and impact review.

## Phase 01 — Identity and Access

- authentication provider implementation behind the agreed abstraction
- sessions/tokens
- user profile
- roles and permissions
- platform administrator vs agency users
- email/phone verification strategy
- privileged-account MFA where enabled
- device/session management

Gate: unauthorized access is rejected, role matrix is enforced server-side, tenant scope cannot be bypassed, sensitive actions are audited.

## Phase 02 — Multi-Tenancy and Organization

- agencies/tenants
- branches
- locations
- tenant isolation
- staff membership
- organization settings

Gate: cross-tenant read/write/export attempts are denied and covered by tests.

## Phase 03 — Fleet Foundation

- vehicle categories
- vehicles
- status model
- mileage/fuel data
- vehicle documents
- operational blocks
- structured vehicle gallery

Gate: one vehicle has a coherent lifecycle record and its document expiry/operational state is queryable.

## Phase 04 — Availability Engine

- reservation intervals
- operational blocking intervals
- conflict detection
- scheduler/timeline
- branch/location constraints
- availability APIs
- race-condition/concurrency protection

Gate: overlapping commitments cannot be created, including concurrent requests, and availability is never derived only from a mutable boolean.

## Phase 05 — Booking Engine

- quote creation
- reservation lifecycle/state machine
- confirmation/cancellation/no-show
- extensions
- manual/walk-in/phone booking
- vehicle reassignment
- booking snapshots
- idempotency and concurrency protection

Gate: every state transition is valid, auditable and tested; online and manual bookings use the same domain rules.

## Phase 06 — Pricing Engine

- base rates
- duration rates
- seasonal/special-date rules
- weekend/holiday rules
- discounts/promotions
- extras/fees
- location/delivery fees
- deposit
- server-side calculation
- historical price snapshots
- transparent price breakdown

Gate: client totals cannot influence authoritative totals and historical booking pricing remains reproducible after configuration changes.

## Phase 07 — Customer Platform & Marketplace

- customer profile
- marketplace search/filter
- map/list search
- participating-agency discovery
- public agency profiles
- vehicle details/gallery
- location details
- quote/checkout
- reservation portal
- documents
- rental lifecycle
- reviews/comments
- support

Gate: a customer can discover, compare, select a specific agency offer, and complete a booking without exposing another tenant/customer or confusing platform and agency responsibility.

## Phase 08 — Contracts and Documents

- rental agreement
- document requirements
- versioned contract templates
- digital signature workflow
- generated receipts/PDFs
- localized documents
- document storage/access controls

Gate: a historical signed contract can be reproduced and unauthorized document access is denied.

## Phase 09 — Payments and Billing

- payment intents/records
- deposits
- partial/full payment
- refunds
- outstanding balances
- invoices
- provider abstraction
- webhook reconciliation
- cash/transfer/manual reconciliation

Gate: duplicate webhook/payment events are idempotent, financial records are auditable, and provider failures do not corrupt booking truth.

## Phase 10 — Inspection and Damage

- pickup inspection
- return inspection
- structured photos/evidence
- condition checklist
- vehicle damage blueprint/markers
- damage records
- settlement workflow
- audit trail

Gate: a return inspection is linked to the rental, evidence is preserved, and damage findings cannot silently become financial liability.

## Phase 11 — Maintenance and Vehicle Readiness

- service schedules
- maintenance records
- maintenance blocks
- cleaning/preparation workflow
- readiness state
- insurance/registration/inspection reminders
- maintenance costs

Gate: a returned vehicle cannot become rentable while configured readiness blockers remain unresolved.

## Phase 12 — Owner Operations Dashboard

- KPI dashboard
- attention/exception center
- calendar
- fleet intelligence
- revenue/profitability
- utilization
- branch performance
- operational reports

Gate: dashboard metrics reconcile with authoritative domain data and every exception provides a useful next action.

## Phase 13 — Agency Mobile Operations

- daily tasks
- pickup workflow
- return workflow
- inspection capture
- QR lookup
- customer handoff
- issue reporting
- connectivity/sync status

Gate: staff can complete a real pickup/return workflow on mobile and unsafe offline operations are prevented.

## Phase 14 — Customer Mobile App (Future)

- login/profile
- search/booking
- map/list
- reservation management
- digital check-in
- QR pickup
- my rental
- extension
- support
- notifications

Gate: customer mobile and web produce consistent authoritative booking/pricing behavior.

## Phase 15 — Notifications and Automation

- event-driven notifications
- push
- email adapter
- SMS/WhatsApp adapters where enabled
- reminders
- overdue flows
- scheduled jobs
- notification preferences

Gate: notification events are idempotent, localized, and do not leak tenant/customer data.

## Phase 16 — Partners, Loyalty, Referrals

- partner codes/QRs
- referral tracking
- loyalty rules
- commissions
- attribution reporting

Gate: attribution and commission calculations are reproducible and auditable.

## Phase 17 — Analytics and AI Assistance

- business analytics
- utilization forecasting
- profitability insights
- demand heatmaps
- document extraction
- inspection/damage comparison
- owner decision support
- recommendation explanations

Gate: analytics use authorized data; AI cannot bypass permissions or mutate critical facts without explicit validated workflows.

## Phase 18 — Security Hardening and Reliability

- security review
- tenant isolation tests
- abuse/rate-limit review
- permission matrix verification
- backups/recovery
- observability
- performance/load checks
- dependency review

Gate: security checklist passes and recovery procedures are tested.

## Phase 19 — Production Readiness

- E2E coverage of critical journeys
- migration rehearsal
- deployment verification
- mobile release preparation
- operational runbooks
- Definition of Done audit
- production smoke tests

Gate: critical journeys pass in a production-like environment and rollback/recovery procedures are documented.

## Global Agent rule

Implement only the phase being executed and its explicit dependencies. Do not pull future features into an active phase merely because the architecture supports them. When a requirement is ambiguous, consult the repository documentation and references; do not invent a business rule. When a material architectural decision changes, stop and document an ADR before continuing.
