# 43 — Release Roadmap & MVP Scope

## Purpose

Define exactly what is shipped in each product release. Architecture remains extensible, but implementation scope is controlled so the team can reach a real pilot quickly.

## Product strategy

The platform has two connected products:

1. Agency SaaS: operational system for rental agencies.
2. Marketplace: public discovery/search layer across participating agencies.

The architecture supports the long-term product from day one, but not every future feature is activated in Release 1.

## Release 1 — Pilot-ready core

### Customer Web / Marketplace

Must ship:
- Arabic, French, English
- RTL support
- responsive/mobile-first UX
- search by location, date/time and return location
- map + list results
- agency profiles
- agency verification/status display
- agency-specific vehicle listings
- vehicle details and galleries
- transparent quote breakdown
- booking/request flow
- customer account/basic profile
- booking status/history
- document upload where required
- support/contact path
- reviews and comments only after an eligible completed experience

Payment approach:
- cash
- bank transfer
- pay at agency / manual payment
- deposit recording where agency policy requires it
- no dependency on an online gateway for pilot launch

### Agency Owner/Admin Web

Must ship:
- agency onboarding/configuration
- branch/location management
- map pin management
- parking/pickup points
- delivery zones and fees
- fleet and vehicle categories
- vehicle documents
- vehicle images
- availability calendar/scheduler
- bookings
- customers
- pricing/rates
- promotions/basic discounts
- deposits/fees
- contracts/documents
- pickup/return workflows
- inspection and damage records
- maintenance records/basic readiness
- payments/manual reconciliation
- staff management and role permissions
- dashboard/attention center
- basic reports
- agency public profile management

### Agency Operations Mobile App

Must ship:
- secure agency login
- today's tasks
- pickup workflow
- return workflow
- QR booking lookup
- customer/document verification
- mileage capture
- fuel capture
- inspection checklist
- photo evidence
- damage reporting
- readiness/preparation status
- issue escalation
- notifications
- navigation/location support where authorized

### Platform Owner Web

Must ship:
- agency/tenant management
- agency verification/moderation
- plan management
- trial management
- entitlements
- license key management
- manual subscription/payment recording
- feature flags
- support oversight
- audit/security oversight
- marketplace moderation controls
- advertising configuration model
- marketplace commission configuration model (can remain disabled)

## Release 1 intentionally excludes full production activation of

- dedicated customer mobile app
- advanced AI automation
- automatic AI liability decisions
- live GPS/telematics
- automated smart pricing
- loyalty program
- complex referral/partner network
- advanced accounting integrations
- automated insurance integrations
- automatic online subscription billing
- marketplace payouts/escrow unless legally/commercially required and explicitly implemented

These remain architected for future releases.

## Release 1 payment/monetization configuration

The platform may simultaneously support:
- Free agency tier
- configurable Trial
- Paid subscription
- License Key
- Manual renewal/BaridiMob evidence/reference recording
- Google Ads on eligible public surfaces

A production launch may initially activate only a subset, but the architecture must not require code restructuring to enable another method later.

Recommended pilot configuration:
- 30-day configurable trial
- one simple paid plan
- manual renewal
- optional Free plan if useful for acquisition
- Google Ads disabled during initial UX/pilot unless it does not harm marketplace conversion
- marketplace commission disabled until marketplace transaction volume and legal/commercial terms justify it

## Release 1 marketplace model

The marketplace should be real enough for pilot use, not a fake future screen.

A customer can discover multiple agencies, compare eligible offers, select one agency offer, and create a booking with that agency.

Agency autonomy remains intact:
- each agency controls its own fleet
- each agency controls its own pricing
- each agency controls its own policies
- each agency remains operationally responsible for its booking
- platform displays the agency clearly

## Release 1 success gates

Release 1 is pilot-ready only when:

- a new agency can be onboarded without developer intervention
- an agency can add a vehicle and make it bookable
- a customer can find that vehicle through the marketplace
- the customer can create a booking
- the agency receives and processes it
- staff can complete pickup
- staff can complete return
- inspection evidence is stored
- financial records remain auditable
- a second agency can operate without seeing the first agency's data
- Arabic/French/English journeys work
- map search works for supported locations
- critical booking concurrency tests pass
- permissions and tenant isolation tests pass
- backup/restore procedure is validated
- monitoring/logging is operational

## Release 2 — Growth

Target additions:
- dedicated customer mobile app
- richer customer self-service
- push notifications
- digital check-in improvements
- QR pickup improvements
- loyalty
- referrals
- stronger reviews/reputation
- partner/hotel/referral tools
- Chargily or another suitable online payment provider after commercial/legal/technical validation
- richer analytics
- agency comparison improvements

## Release 3 — Intelligence & Scale

Target additions:
- AI document extraction
- AI-assisted damage comparison
- smart pricing recommendations
- utilization forecasting
- advanced owner AI assistant
- GPS/telematics integrations
- live fleet map
- advanced automation
- larger partner ecosystem
- API integrations for external agencies/hotels/travel platforms

## Release 4 — Regional platform

Potential additions:
- Morocco/Tunisia expansion adaptations
- currency/localization extensions
- country-specific policy modules
- regional payment integrations
- cross-border rental rules where appropriate
- marketplace growth tooling
- advanced advertising/monetization controls

## Scope control rules

- A future feature can be documented in architecture without being implemented.
- No Release 1 feature is added merely because it exists in a reference repository.
- Every feature must have a business owner, user value, domain impact, permission model and acceptance criteria.
- Critical business correctness outranks feature count.
- The project should optimize for a successful real-agency pilot, not for maximum demo feature count.

## Definition of MVP

For this project, "MVP" means the smallest complete system that can operate a real rental workflow across multiple agencies from discovery to return while maintaining financial, authorization, audit, localization and tenant-isolation correctness.

It does not mean a single-table booking demo.
