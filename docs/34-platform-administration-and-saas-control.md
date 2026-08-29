# 34 — Platform Administration & SaaS Control Center

## Purpose

The platform owner needs a separate control plane above agency-level administration. This control plane manages the SaaS itself without exposing tenant business data unnecessarily.

## Roles

### Platform Owner / Super Admin

Controls the platform, plans, entitlements, support configuration, feature flags, and operational policies.

### Agency Owner

Controls one agency/tenant and its business operations.

### Agency Staff

Receives only explicitly granted operational permissions.

### Customer

Uses booking/rental self-service features and cannot access agency administration.

## Platform Owner capabilities

### SaaS overview

- total agencies
- active agencies
- trials
- expired accounts
- paid subscriptions
- monthly recurring revenue when billing data supports it
- failed payments
- active mobile versions
- platform health
- recent support/escalation events

### Tenant management

- search agencies
- view tenant health/status
- suspend/reinstate tenant access with reason
- reset or assist account access through secure recovery workflows
- inspect plan/entitlement state
- view audit history
- impersonation must be disabled by default; where support impersonation exists it requires explicit authorization, visible banner, time limit, and audit log

### Plan management

- create/archive plans
- feature entitlements
- capacity limits
- trial configuration
- grace periods
- pricing configuration
- plan visibility

### Licensing management

- generate license keys
- choose plan/entitlements granted
- activation count
- expiration
- start date
- tenant restriction
- revoke
- rotate/reissue
- audit history

License generation must use a cryptographically secure random source. Keys must not contain predictable tenant IDs or sequential identifiers.

### Feature flags

Platform Owner can enable/disable selected capabilities independently of plan changes where safe.

Examples:

- AI damage comparison
- AI document extraction
- GPS integration
- partner module
- advanced analytics
- experimental map provider

Feature flags are not a replacement for authorization or entitlements. Both checks may be required.

### Global configuration

- supported languages
- supported currencies
- platform maintenance mode
- notification provider configuration
- map provider configuration
- file-storage policies
- retention policies
- security policies

Sensitive credentials must remain in secret management and never be stored as ordinary configuration records.

## Tenant suspension model

Use explicit states rather than a generic boolean:

ACTIVE
TRIAL
GRACE
RESTRICTED
SUSPENDED
CLOSED

Transitions must have authorized actors, reasons, timestamps, and audit records.

## Safe restriction behavior

When a tenant loses paid access:

- do not destroy historical business data
- clearly communicate why access changed
- provide billing/recovery path
- restrict new operations according to policy
- preserve the ability to export or recover data according to the contractual/retention policy

## Support console

Support staff should see a focused operational view:

- account identity
- plan state
- recent errors
- recent billing events
- recent important audit events
- active support tickets
- app versions

Avoid exposing customer document contents or sensitive personal data unless required and authorized.

## Audit requirements

Every high-risk platform action should record:

- actor
- timestamp
- action
- target tenant/resource
- previous state where appropriate
- new state where appropriate
- reason/context
- request/correlation identifier where available

## Product analytics privacy

Platform-level metrics should prefer aggregate values. Tenant/business data should remain tenant-scoped and subject to contractual, privacy, and retention rules.

## Operational principle

The platform owner controls the SaaS machinery; agency owners control their businesses. Never blur the two authorization boundaries.