# 36 — Authentication & Authorization Architecture

## Purpose

Define how identity, sessions, roles, permissions, tenant membership, and privileged platform access work across Customer Web, Agency Operations App, Agency Owner/Admin Web, and Platform Owner Web.

## Core distinction

Authentication answers: **Who is this user?**

Authorization answers: **What may this authenticated user do, for which tenant/branch/resources?**

These concerns must remain separate.

## Identity model

A person is represented by one user identity. Access to an agency is granted through an explicit agency membership rather than by copying agency ownership onto the user record.

Conceptual model:

```text
User
 ├── Agency Membership(s)
 │     ├── Role(s)
 │     └── Permission scope
 └── Platform role (only for platform operators)
```

A single person may legitimately be both a customer and an agency member. The backend must resolve access from explicit memberships and permissions.

## Roles

Minimum roles:

- Platform Admin
- Agency Owner/Admin
- Branch Manager
- Staff/Agent
- Finance (optional)
- Customer

Roles are defaults/bundles. Fine-grained permissions are the actual authorization capabilities.

## Permission examples

```text
vehicle.read
vehicle.create
vehicle.update
vehicle.archive
booking.read
booking.create
booking.confirm
booking.cancel
booking.extend
booking.return
inspection.create
inspection.approve
payment.read
payment.record
payment.refund
pricing.read
pricing.manage
staff.manage
reports.read
billing.manage
```

The permission catalog must be documented and versioned.

## Tenant scope

Every privileged request is evaluated against:

1. authenticated user
2. tenant/agency membership
3. active role/permissions
4. target resource ownership
5. branch/location scope when applicable
6. subscription/entitlement limits where applicable

Never authorize because a client supplied a matching `tenantId`.

## Session/token strategy

The final identity provider may be managed or application-owned. The architecture must support secure web sessions and mobile authentication without duplicating identity logic.

Requirements:

- short-lived access credentials where applicable
- refresh/session rotation strategy
- secure logout and revocation
- device/session visibility for privileged users where justified
- password reset
- email/phone verification according to selected auth provider
- optional MFA for privileged accounts
- brute-force protection and rate limiting

Do not store long-lived authentication secrets in ordinary local storage on the web.

Mobile secure storage must use platform-appropriate secure storage.

## MFA

MFA is strongly recommended for Platform Admin and Agency Owner/Admin accounts. The exact factor/provider is an implementation decision after security review.

## Account lifecycle

```text
Invited
   ↓
Pending Verification
   ↓
Active
   ↓
Suspended (optional)
   ↓
Deactivated
```

Deactivation must not delete historical business records.

## Agency membership lifecycle

```text
Invited → Active → Suspended/Removed
```

Removing a staff member revokes future access but preserves their historical actor references in audit and operational records.

## Platform Admin isolation

Platform Admin access is a separate security boundary from Agency Owner access.

Agency Owner must never become Platform Admin by changing a tenant role or by supplying a client-selected role.

Platform-level actions require explicit platform-level authorization.

## Customer access

Customers may access only their own profile, bookings, documents, payments/statuses, support records, and other explicitly customer-owned data.

A customer must not gain agency operational access simply because their email matches an agency account.

## API authorization flow

```text
Request
  ↓
Authentication
  ↓
Identify user/session
  ↓
Resolve tenant + membership
  ↓
Check permission
  ↓
Check resource ownership/scope
  ↓
Check business rule/entitlement
  ↓
Execute domain operation
  ↓
Audit sensitive actions
```

## Security requirements

- deny by default
- server-side authorization is mandatory
- validate all resource ownership
- prevent IDOR/BOLA
- rate-limit authentication and sensitive endpoints
- do not leak whether privileged resources exist unnecessarily
- do not place authorization secrets or policy decisions only in frontend code
- log security-significant events without logging passwords/tokens/secrets

## Auth provider decision

Supabase Auth remains a viable managed option because it is compatible with PostgreSQL-based architecture. A different identity provider or NestJS-oriented solution may be selected after comparing MFA, session management, mobile flows, operational control, portability, and cost.

The application domain must not become dependent on provider-specific user IDs everywhere. Use an application user identity boundary and explicit mapping where the provider requires it.

## Definition of done

Auth is not complete until:

- all roles are mapped
- permission matrix is approved
- tenant isolation tests pass
- privileged routes are protected server-side
- session/logout/revocation behavior is tested
- password/verification flows are tested
- MFA strategy is implemented for required roles
- audit coverage is defined
