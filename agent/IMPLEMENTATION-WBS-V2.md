# KAVRIQO — Agent-Agnostic Implementation WBS v2

Status: **CANONICAL EXECUTION PLAN**

This WBS supersedes the assumption that five broad tasks per phase are sufficient for implementation. The legacy 95 task IDs remain stable for traceability, but each legacy task is decomposed into smaller implementation tasks below.

## Execution hierarchy

```text
Program
└── Release
    └── Phase
        └── Workstream
            └── Task
                └── Optional Subtask
                    └── Verification / Evidence
```

### Task sizing rule

A Task should normally be a small coherent unit that one coding agent can implement and verify without losing context. Prefer 1–4 hours of focused engineering work. If a task would require many unrelated files, multiple independent acceptance outcomes, or several distinct user journeys, split it into subtasks without changing the parent traceability ID.

### Canonical rule

- Phase and Workstream order is fixed.
- Dependencies must be satisfied before a task starts.
- A task is complete only with evidence.
- An agent may create implementation subtasks when necessary, but must not silently enlarge scope.
- Release 1 priorities are marked `[R1]`.
- Future work remains documented but must not be pulled into Release 1.

---

# PHASE 01 — Identity & Access

## 01-A Runtime Foundation [R1]
- 01-A01 Initialize workspace/package manager conventions
- 01-A02 Bootstrap NestJS application shell
- 01-A03 Establish environment schema and startup validation
- 01-A04 Establish configuration module and secret boundaries
- 01-A05 Establish `/api/v1` routing baseline
- 01-A06 Add health/readiness endpoints
- 01-A07 Establish test runner and test conventions
- 01-A08 Establish lint/typecheck/build commands
- 01-A09 Add structured logging and correlation ID baseline
- 01-A10 Verify clean development boot and document evidence

## 01-B Supabase Identity Boundary [R1]
- 01-B01 Define Auth provider adapter interface
- 01-B02 Define Supabase token verification boundary
- 01-B03 Map external identity ID to application user ID
- 01-B04 Handle unknown authenticated identity provisioning
- 01-B05 Handle disabled/deleted provider identity
- 01-B06 Define email/password flows
- 01-B07 Define email verification flow
- 01-B08 Define password recovery flow
- 01-B09 Define MFA capability boundary
- 01-B10 Add auth integration tests

## 01-C User Identity [R1]
- 01-C01 Create users migration
- 01-C02 Implement user repository
- 01-C03 Implement user lifecycle states
- 01-C04 Implement locale/timezone preferences
- 01-C05 Implement unique identity constraints
- 01-C06 Implement profile retrieval/update
- 01-C07 Implement provider-link consistency checks
- 01-C08 Add identity service tests

## 01-D Authorization [R1]
- 01-D01 Create permissions catalog
- 01-D02 Create roles model
- 01-D03 Create membership-role model
- 01-D04 Implement permission evaluation service
- 01-D05 Implement platform scope guards
- 01-D06 Implement agency scope guards
- 01-D07 Implement branch/resource scope guards
- 01-D08 Deny client tenant/role spoofing
- 01-D09 Audit privileged authorization events
- 01-D10 Add negative authorization tests

## 01-E Session/Security Gate [R1]
- 01-E01 Implement session invalidation/revocation boundary
- 01-E02 Add rate-limit boundaries for sensitive auth routes
- 01-E03 Add secure error responses
- 01-E04 Add auth security regression suite
- 01-E05 Run Phase 01 gate

---

# PHASE 02 — Multi-Tenancy & Organization

## 02-A Agency/Tenant [R1]
- 02-A01 Create tenant migration
- 02-A02 Implement tenant repository/service
- 02-A03 Implement tenant lifecycle states
- 02-A04 Implement agency slug/public identity
- 02-A05 Implement tenant settings
- 02-A06 Implement marketplace participation flag
- 02-A07 Implement verification state
- 02-A08 Add tenant tests

## 02-B Membership [R1]
- 02-B01 Implement membership invitation model
- 02-B02 Implement accept/decline membership flow
- 02-B03 Implement membership status transitions
- 02-B04 Implement role assignment
- 02-B05 Implement membership removal/revocation
- 02-B06 Test multi-agency user membership

## 02-C Branches & Locations [R1]
- 02-C01 Create branch model
- 02-C02 Create canonical locations model
- 02-C03 Create branch/location constraints
- 02-C04 Implement operating hours
- 02-C05 Implement exception hours
- 02-C06 Implement branch contacts
- 02-C07 Implement airport/hotel/pickup location types
- 02-C08 Implement delivery zones baseline

## 02-D Tenant Isolation [R1]
- 02-D01 Establish request tenant context
- 02-D02 Establish repository tenant scope helpers
- 02-D03 Scope background jobs by tenant
- 02-D04 Scope exports by tenant
- 02-D05 Scope document/media access by tenant
- 02-D06 Add cross-tenant read denial tests
- 02-D07 Add cross-tenant write denial tests
- 02-D08 Add cross-tenant export denial tests
- 02-D09 Run Phase 02 gate

---

# PHASE 03 — Fleet Foundation

## 03-A Categories [R1]
- 03-A01 Vehicle category schema
- 03-A02 Category attributes
- 03-A03 Category feature catalog
- 03-A04 Category CRUD API
- 03-A05 Category authorization
- 03-A06 Category localization fields
- 03-A07 Category tests

## 03-B Vehicles [R1]
- 03-B01 Vehicle schema
- 03-B02 Vehicle identity/plate/VIN rules
- 03-B03 Vehicle status lifecycle
- 03-B04 Current branch assignment
- 03-B05 Odometer model
- 03-B06 Fuel model
- 03-B07 Vehicle detail API
- 03-B08 Vehicle list/filter API
- 03-B09 Vehicle authorization tests
- 03-B10 Vehicle migration tests

## 03-C Vehicle Media/Documents [R1]
- 03-C01 Media object interface
- 03-C02 R2 adapter boundary
- 03-C03 Private object policy
- 03-C04 Vehicle gallery model
- 03-C05 Image ordering/primary image
- 03-C06 Vehicle document model
- 03-C07 Document expiry rules
- 03-C08 Secure signed access
- 03-C09 Upload validation

## 03-D Fleet UI [R1]
- 03-D01 Fleet list UX
- 03-D02 Vehicle creation form
- 03-D03 Vehicle edit form
- 03-D04 Vehicle detail page
- 03-D05 Vehicle status controls
- 03-D06 Gallery management UX
- 03-D07 Document expiry UI
- 03-D08 Arabic/French/English validation
- 03-D09 Responsive/RTL visual QA
- 03-D10 Phase 03 gate

---

# PHASE 04 — Availability Engine

## 04-A Interval Model [R1]
- 04-A01 Define reservation interval semantics
- 04-A02 Define operational block interval semantics
- 04-A03 Create vehicle block schema
- 04-A04 Create booking hold schema
- 04-A05 Define timezone conversion boundary
- 04-A06 Add interval validation tests

## 04-B Conflict Protection [R1]
- 04-B01 Define active conflicting statuses
- 04-B02 Add PostgreSQL exclusion/conflict strategy
- 04-B03 Add transaction strategy
- 04-B04 Add lock/retry strategy
- 04-B05 Prevent stale-hold collisions
- 04-B06 Add race-condition tests
- 04-B07 Add duplicate retry tests

## 04-C Availability Queries [R1]
- 04-C01 Vehicle availability query
- 04-C02 Category capacity query
- 04-C03 Branch-aware availability
- 04-C04 Maintenance block integration
- 04-C05 Inspection/readiness blocker integration
- 04-C06 Delivery/location constraint integration
- 04-C07 Availability API
- 04-C08 Availability response contract

## 04-D Scheduler [R1]
- 04-D01 Timeline query model
- 04-D02 Calendar day/week/month views
- 04-D03 Conflict visualization
- 04-D04 Vehicle filter
- 04-D05 Branch filter
- 04-D06 Availability cache/invalidation
- 04-D07 Visual QA
- 04-D08 Phase 04 gate

---

# PHASE 05 — Booking Engine

## 05-A Quote/Request [R1]
- 05-A01 Quote request DTOs
- 05-A02 Eligibility validation
- 05-A03 Availability integration
- 05-A04 Pricing integration boundary
- 05-A05 Quote expiry
- 05-A06 Quote response contract
- 05-A07 Quote tests

## 05-B Booking Aggregate [R1]
- 05-B01 Booking schema
- 05-B02 Booking numbering
- 05-B03 Vehicle-specific booking
- 05-B04 Category booking
- 05-B05 Booking holds
- 05-B06 Booking price snapshot linkage
- 05-B07 Booking status history
- 05-B08 Booking aggregate tests

## 05-C State Machine [R1]
- 05-C01 Implement DRAFT
- 05-C02 Implement HOLD
- 05-C03 Implement PENDING_CONFIRMATION
- 05-C04 Implement CONFIRMED
- 05-C05 Implement READY_FOR_PICKUP
- 05-C06 Implement ACTIVE
- 05-C07 Implement RETURN_PENDING
- 05-C08 Implement RETURNED
- 05-C09 Implement SETTLEMENT_PENDING
- 05-C10 Implement COMPLETED
- 05-C11 Implement exceptional states
- 05-C12 Authorize every transition

## 05-D Lifecycle Operations [R1]
- 05-D01 Customer cancellation
- 05-D02 Agency cancellation
- 05-D03 Hold expiration
- 05-D04 No-show workflow
- 05-D05 Extension request
- 05-D06 Extension conflict handling
- 05-D07 Vehicle reassignment
- 05-D08 Walk-in/manual booking
- 05-D09 Idempotent booking commands
- 05-D10 Audit lifecycle events
- 05-D11 Booking integration tests
- 05-D12 Phase 05 gate

---

# PHASE 06 — Pricing Engine

## 06-A Rate Model [R1]
- 06-A01 Rate plan schema
- 06-A02 Currency handling
- 06-A03 Effective dates
- 06-A04 Vehicle/category applicability
- 06-A05 Duration units
- 06-A06 Rule precedence
- 06-A07 Rate administration API

## 06-B Time Rules [R1]
- 06-B01 Hourly pricing
- 06-B02 Daily pricing
- 06-B03 Weekly pricing
- 06-B04 Monthly pricing
- 06-B05 Duration tiers
- 06-B06 Seasonal pricing
- 06-B07 Special-date pricing
- 06-B08 Weekend/holiday rules

## 06-C Commercial Adjustments [R1]
- 06-C01 Promotions
- 06-C02 Coupons
- 06-C03 Extras
- 06-C04 Delivery fee
- 06-C05 Distance fee
- 06-C06 One-way fee
- 06-C07 After-hours fee
- 06-C08 Deposit pricing
- 06-C09 Eligibility-based pricing rules

## 06-D Financial Truth [R1]
- 06-D01 Exact money library
- 06-D02 Rounding policy
- 06-D03 DZD defaults
- 06-D04 Multi-currency representation
- 06-D05 Deterministic calculation tests
- 06-D06 Quote snapshot
- 06-D07 Booking snapshot
- 06-D08 Snapshot immutability tests
- 06-D09 Pricing concurrency tests
- 06-D10 Phase 06 gate

---

# PHASE 07 — Customer Platform & Marketplace

## 07-A Customer Identity/Profile [R1]
- 07-A01 Customer profile schema
- 07-A02 Customer account linkage
- 07-A03 Customer profile settings
- 07-A04 Customer document requirements state
- 07-A05 Customer favorites
- 07-A06 Recently viewed
- 07-A07 Search history baseline

## 07-B Search [R1]
- 07-B01 Search contract
- 07-B02 Location search
- 07-B03 Date/time search
- 07-B04 Vehicle/category filters
- 07-B05 Price filters
- 07-B06 Feature/transmission/fuel filters
- 07-B07 Agency filters
- 07-B08 Availability filtering
- 07-B09 PostgreSQL index strategy
- 07-B10 Pagination/sorting
- 07-B11 Empty-result behavior

## 07-C Maps [R1]
- 07-C01 MapLibre integration
- 07-C02 MapTiler adapter
- 07-C03 Geocoding adapter
- 07-C04 Autocomplete
- 07-C05 Agency markers
- 07-C06 Marker clustering
- 07-C07 Map/list synchronized state
- 07-C08 Search-this-area
- 07-C09 Proximity query
- 07-C10 Pickup/branch map details
- 07-C11 Map performance validation

## 07-D Agency Public Profiles [R1]
- 07-D01 Agency public identity
- 07-D02 Verification badge
- 07-D03 Public branches/locations
- 07-D04 Opening hours
- 07-D05 Policies
- 07-D06 Public contact methods
- 07-D07 Agency rating summary
- 07-D08 Public vehicle inventory
- 07-D09 Vehicle offer detail
- 07-D10 Structured gallery UX

## 07-E Customer Booking Portal [R1]
- 07-E01 Search results UX
- 07-E02 Offer comparison
- 07-E03 Availability refresh
- 07-E04 Quote review
- 07-E05 Customer information form
- 07-E06 Agency policy presentation
- 07-E07 Payment-method selection
- 07-E08 Reservation confirmation
- 07-E09 Reservation detail
- 07-E10 Customer cancellation UI
- 07-E11 Customer support/contact
- 07-E12 Marketplace E2E gate

---

# PHASE 08 — Contracts & Documents

## 08-A Requirements
- 08-A01 Document type catalog
- 08-A02 Agency document policy
- 08-A03 Customer required-document rules
- 08-A04 Booking document status
- 08-A05 Expiry handling

## 08-B Templates [R1]
- 08-B01 Template model
- 08-B02 Template versioning
- 08-B03 Arabic template
- 08-B04 French template
- 08-B05 English template
- 08-B06 Variable substitution
- 08-B07 Version selection rules

## 08-C Contract/Receipt [R1]
- 08-C01 Rental contract aggregate
- 08-C02 Contract snapshot
- 08-C03 Signature boundary
- 08-C04 PDF rendering
- 08-C05 Receipt generation
- 08-C06 Contract download
- 08-C07 Historical reproducibility tests

## 08-D Secure Documents [R1]
- 08-D01 Private media authorization
- 08-D02 Signed access URLs
- 08-D03 Access audit events
- 08-D04 Retention metadata
- 08-D05 Revocation behavior
- 08-D06 Document security tests
- 08-D07 Phase 08 gate

---

# PHASE 09 — Payments & Billing

## 09-A Rental Payments [R1]
- 09-A01 Payment intent model
- 09-A02 Cash payment
- 09-A03 Bank transfer evidence
- 09-A04 Pay-at-agency state
- 09-A05 Partial payments
- 09-A06 Deposit lifecycle
- 09-A07 Allocation model
- 09-A08 Manual confirmation workflow

## 09-B Financial Ledger [R1]
- 09-B01 Transaction model
- 09-B02 Invoice model
- 09-B03 Invoice items
- 09-B04 Payment history
- 09-B05 Balance calculations
- 09-B06 Immutable financial events
- 09-B07 Reconciliation view

## 09-C Refunds/Adjustments [R1]
- 09-C01 Refund model
- 09-C02 Cancellation financial outcome
- 09-C03 Damage settlement charge
- 09-C04 Manual adjustment
- 09-C05 Approval rules
- 09-C06 Reconciliation tests

## 09-D Provider Boundary
- 09-D01 Payment provider interface
- 09-D02 Webhook event model
- 09-D03 Webhook signature boundary
- 09-D04 Idempotent event processing
- 09-D05 Future Chargily adapter contract
- 09-D06 Phase 09 gate

---

# PHASE 10 — Inspection & Damage

## 10-A Inspection Engine [R1]
- 10-A01 Inspection schema
- 10-A02 Inspection templates
- 10-A03 Pickup inspection
- 10-A04 Return inspection
- 10-A05 Interim inspection
- 10-A06 Checklist items
- 10-A07 Mileage capture
- 10-A08 Fuel capture
- 10-A09 Actor/timestamp capture

## 10-B Evidence [R1]
- 10-B01 Photo capture contract
- 10-B02 Secure photo upload
- 10-B03 Before/after evidence linking
- 10-B04 Photo metadata
- 10-B05 Damage record model
- 10-B06 Damage evidence model
- 10-B07 Evidence timeline UX

## 10-C Settlement [R1]
- 10-C01 Human damage assessment
- 10-C02 Damage amount calculation
- 10-C03 Customer review/dispute state
- 10-C04 Settlement approval
- 10-C05 Financial event integration
- 10-C06 Audit history
- 10-C07 AI recommendation boundary for future use

## 10-D Operations QA
- 10-D01 Pickup E2E
- 10-D02 Return E2E
- 10-D03 Damage E2E
- 10-D04 Evidence access test
- 10-D05 Phase 10 gate

---

# PHASE 11 — Maintenance & Readiness

## 11-A Maintenance [R1]
- 11-A01 Maintenance schema
- 11-A02 Preventive schedule
- 11-A03 Service event
- 11-A04 Vendor/reference fields
- 11-A05 Cost recording
- 11-A06 Maintenance history
- 11-A07 Maintenance reminders

## 11-B Operational Blocks [R1]
- 11-B01 Maintenance booking block
- 11-B02 Damage block
- 11-B03 Inspection block
- 11-B04 Transfer block
- 11-B05 Cleaning block
- 11-B06 Manual block
- 11-B07 Conflict tests

## 11-C Readiness [R1]
- 11-C01 Cleaning status
- 11-C02 Fuel readiness
- 11-C03 Inspection readiness
- 11-C04 Document readiness
- 11-C05 Ready-for-rental state
- 11-C06 Readiness UI
- 11-C07 Availability integration

## 11-D Expiry/Operations
- 11-D01 Insurance expiry
- 11-D02 Registration expiry
- 11-D03 Technical inspection expiry
- 11-D04 Maintenance expiry
- 11-D05 Escalation rules
- 11-D06 Phase 11 gate

---

# PHASE 12 — Operations & Platform Control Plane

## 12-A Agency Operations Dashboard [R1]
- 12-A01 KPI model
- 12-A02 Attention center
- 12-A03 Upcoming pickups
- 12-A04 Upcoming returns
- 12-A05 Overdue rentals
- 12-A06 Fleet readiness summary
- 12-A07 Maintenance alerts
- 12-A08 Document expiry alerts
- 12-A09 Revenue summary
- 12-A10 Utilization summary

## 12-B Calendar/Intelligence [R1]
- 12-B01 Operations calendar
- 12-B02 Vehicle timeline
- 12-B03 Branch calendar
- 12-B04 Conflict indicators
- 12-B05 Utilization query
- 12-B06 Revenue query
- 12-B07 Exportable reports

## 12-C Platform Control Plane [R1]
- 12-C01 Platform admin shell
- 12-C02 Agency directory
- 12-C03 Agency verification queue
- 12-C04 Agency suspension/restriction
- 12-C05 Plan catalog
- 12-C06 Trial configuration
- 12-C07 Subscription state
- 12-C08 License issuance
- 12-C09 License activation/revocation
- 12-C10 Entitlement computation
- 12-C11 Feature flags
- 12-C12 Tenant overrides
- 12-C13 Marketplace commission rules
- 12-C14 Google Ads configuration
- 12-C15 Moderation queue
- 12-C16 Support oversight

## 12-D Reports/Reconciliation [R1]
- 12-D01 Agency revenue report
- 12-D02 Fleet utilization report
- 12-D03 Booking report
- 12-D04 Payment reconciliation report
- 12-D05 Deposit report
- 12-D06 Commission report
- 12-D07 CSV export
- 12-D08 PDF report baseline
- 12-D09 Report permission tests
- 12-D10 Phase 12 gate

---

# PHASE 13 — Agency Staff Mobile

## 13-A Mobile Foundation [R1]
- 13-A01 Expo app shell
- 13-A02 Mobile auth boundary
- 13-A03 Navigation
- 13-A04 Design system
- 13-A05 Localization
- 13-A06 RTL
- 13-A07 Secure device storage
- 13-A08 API client contract

## 13-B Operations [R1]
- 13-B01 Daily task list
- 13-B02 Pickup task
- 13-B03 Return task
- 13-B04 Booking lookup
- 13-B05 Customer handoff
- 13-B06 QR scan
- 13-B07 Status mutation authorization

## 13-C Inspection Capture [R1]
- 13-C01 Camera capture
- 13-C02 Photo compression
- 13-C03 Inspection checklist
- 13-C04 Mileage capture
- 13-C05 Fuel capture
- 13-C06 Damage capture
- 13-C07 Upload retry
- 13-C08 Upload progress/error state

## 13-D Resilience [R1]
- 13-D01 Connectivity detection
- 13-D02 Safe offline read model
- 13-D03 Pending-action queue where explicitly safe
- 13-D04 Conflict/replay handling
- 13-D05 Notification foundation
- 13-D06 Device revocation
- 13-D07 Real-device QA
- 13-D08 Phase 13 gate

---

# PHASE 14 — Customer Mobile (Release 2+)

## 14-A Foundation
- 14-A01 Customer mobile shell
- 14-A02 Auth integration
- 14-A03 Localization/RTL
- 14-A04 Navigation
- 14-A05 API client

## 14-B Marketplace
- 14-B01 Search
- 14-B02 Map/list
- 14-B03 Agency profiles
- 14-B04 Vehicle offers
- 14-B05 Favorites

## 14-C Booking
- 14-C01 Quote
- 14-C02 Reservation
- 14-C03 Reservation detail
- 14-C04 Cancellation
- 14-C05 Support

## 14-D Parity/QA
- 14-D01 Cross-client contract tests
- 14-D02 Mobile E2E
- 14-D03 Store release preparation
- 14-D04 Phase 14 gate

---

# PHASE 15 — Notifications & Automation

## 15-A Event Model
- 15-A01 Domain events
- 15-A02 Notification events
- 15-A03 User preferences
- 15-A04 Delivery model
- 15-A05 Idempotency model

## 15-B Channels
- 15-B01 Push adapter
- 15-B02 Email adapter
- 15-B03 SMS adapter
- 15-B04 WhatsApp adapter
- 15-B05 Provider configuration

## 15-C Automation
- 15-C01 Pickup reminder
- 15-C02 Return reminder
- 15-C03 Overdue reminder
- 15-C04 Document expiry reminder
- 15-C05 Subscription expiry reminder
- 15-C06 Scheduled job framework

## 15-D QA
- 15-D01 Localization
- 15-D02 Delivery retry
- 15-D03 Duplicate suppression
- 15-D04 Tenant safety
- 15-D05 Phase 15 gate

---

# PHASE 16 — Partners / Loyalty / Referrals

## 16-A Partners
- 16-A01 Partner entity
- 16-A02 Referral attribution
- 16-A03 Partner campaign
- 16-A04 Partner reporting

## 16-B Loyalty
- 16-B01 Loyalty policy
- 16-B02 Points ledger
- 16-B03 Reward rules
- 16-B04 Expiry/rollback

## 16-C Commissions
- 16-C01 Attribution model
- 16-C02 Commission calculation
- 16-C03 Settlement reporting
- 16-C04 Abuse controls

## 16-D QA
- 16-D01 Audit
- 16-D02 Fraud/rollback tests
- 16-D03 Permissions
- 16-D04 Phase 16 gate

---

# PHASE 17 — Analytics & AI Assistance

## 17-A Analytics
- 17-A01 Analytics event model
- 17-A02 Reporting boundaries
- 17-A03 Utilization analytics
- 17-A04 Revenue analytics
- 17-A05 Forecasting inputs

## 17-B AI Assistance
- 17-B01 AI provider boundary
- 17-B02 Document extraction assistance
- 17-B03 Inspection assistance
- 17-B04 Operational recommendations
- 17-B05 Explainability

## 17-C Governance
- 17-C01 AI permissions
- 17-C02 PII minimization
- 17-C03 Human approval requirements
- 17-C04 Auditability
- 17-C05 Fallback behavior

## 17-D QA
- 17-D01 AI evaluation set
- 17-D02 False-positive handling
- 17-D03 Data-leak tests
- 17-D04 Phase 17 gate

---

# PHASE 18 — Security & Reliability Hardening

## 18-A Threat Model
- 18-A01 Threat model review
- 18-A02 Authentication abuse review
- 18-A03 Tenant isolation review
- 18-A04 Booking race review
- 18-A05 Payment/webhook review
- 18-A06 File exposure review

## 18-B Security Testing [R1]
- 18-B01 BOLA/IDOR suite
- 18-B02 Role escalation suite
- 18-B03 Upload validation suite
- 18-B04 Secret scanning
- 18-B05 Rate-limit validation
- 18-B06 Session/security review

## 18-C Performance [R1]
- 18-C01 API load baseline
- 18-C02 Concurrent booking test
- 18-C03 Search load test
- 18-C04 Database query profiling
- 18-C05 Mobile/API latency review
- 18-C06 Performance remediation

## 18-D Recovery [R1]
- 18-D01 Backup verification
- 18-D02 Restore rehearsal
- 18-D03 RPO validation
- 18-D04 RTO validation
- 18-D05 Observability drill
- 18-D06 Incident evidence
- 18-D07 Phase 18 gate

---

# PHASE 19 — Production Readiness

## 19-A Environment [R1]
- 19-A01 Development environment verification
- 19-A02 Test environment verification
- 19-A03 Production configuration template
- 19-A04 Secret manager validation
- 19-A05 Database migration rehearsal
- 19-A06 Storage configuration validation
- 19-A07 Map provider production validation
- 19-A08 Sentry validation

## 19-B Release Validation [R1]
- 19-B01 Customer discovery E2E
- 19-B02 Agency onboarding E2E
- 19-B03 Fleet E2E
- 19-B04 Booking E2E
- 19-B05 Pickup/return E2E
- 19-B06 Payment/reconciliation E2E
- 19-B07 Reviews E2E
- 19-B08 Platform admin E2E
- 19-B09 Mobile operational E2E

## 19-C Release Operations [R1]
- 19-C01 Runbooks
- 19-C02 Incident severity matrix
- 19-C03 Rollback procedure
- 19-C04 Deployment procedure
- 19-C05 Backup/restore procedure
- 19-C06 Support/onboarding readiness
- 19-C07 Privacy/terms production checklist
- 19-C08 Monitoring/alert thresholds

## 19-D Final Gate [R1]
- 19-D01 Full typecheck/lint/build
- 19-D02 Full automated test suite
- 19-D03 Security gate
- 19-D04 Tenant isolation gate
- 19-D05 Booking concurrency gate
- 19-D06 Financial integrity gate
- 19-D07 Accessibility/RTL gate
- 19-D08 Performance gate
- 19-D09 Recovery gate
- 19-D10 Final evidence report
- 19-D11 Mark `PROJECT_RELEASE_READY` only if all critical gates pass

---

# Agent execution rule

The WBS is intentionally more granular than the legacy five-task-per-phase registry. Agents MUST use this file to decide what “done” means at implementation level.

When a task contains multiple independent deliverables, the agent must create local subtasks/checkboxes and finish them all before marking the parent task complete.

When implementation discovers a missing prerequisite:

```text
Discover gap
→ inspect whether a safe existing task covers it
→ if not, create a traceable subtask/change record
→ update WBS documentation
→ implement
→ test
→ continue
```

Do not stop simply because a high-level legacy task says DONE while required WBS tasks remain incomplete.

## Release boundary

Release 1 must prioritize the tasks marked `[R1]`. Future phases 14–17 are deliberately specified for later delivery and must not be pulled into Release 1 unless the roadmap is formally changed.

## Completion definition

The product is complete only when all tasks required by the active release and all phase gates are complete, not merely when the high-level 95 legacy tasks are marked DONE.
