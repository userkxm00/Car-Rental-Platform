# Authentication & Authorization Architecture

## Scope

This document defines identity, authentication, sessions, roles, tenant membership and authorization for the Car Rental Platform.

## Core distinction

Authentication answers: **Who are you?**

Authorization answers: **What can you do, in which tenant, on which resource?**

Both are mandatory. A successful login never implies permission to access every resource.

## Release 1 actors

- Platform Admin — operator of the SaaS platform.
- Agency Owner/Admin — full administration within one agency according to plan/permissions.
- Branch Manager — branch-scoped management.
- Staff/Agent — operational workflows according to assigned permissions.
- Finance — financial capabilities if enabled.
- Customer — public booking/self-service access through web; dedicated mobile client is later.

## Identity model

One `user` identity may have multiple memberships:

```text
User
 ├── Platform membership (special)
 ├── Organization A membership → role(s)
 └── Organization B membership → role(s)
```

Do not create separate identities simply because a person has multiple roles.

## Authentication options

The final provider must be selected after evaluating:
- email/password requirements
- phone/OTP requirements
- email verification
- password reset
- MFA/2FA
- session management
- mobile compatibility
- social login (optional)
- abuse/rate limiting
- recovery flows
- data portability

The provider must not force the domain model to be provider-specific.

## Recommended authentication posture

- Short-lived access tokens where token-based APIs are used.
- Rotating/revocable refresh/session mechanism.
- Secure HTTP-only cookies for browser sessions where appropriate.
- Secure device storage for mobile credentials/tokens.
- MFA for platform admins and optionally agency admins.
- Email/phone verification according to configured risk/policy.
- Password reset tokens are single-use and expire quickly.
- Rate limit login, OTP, password reset and verification endpoints.

Never store plaintext passwords in the application database.

## Authorization pipeline

Every protected request should conceptually pass through:

```text
Request
 ↓
Authentication
 ↓
User active?
 ↓
Tenant context established
 ↓
Role/permission check
 ↓
Resource ownership/scope check
 ↓
Business rule check
 ↓
Action
 ↓
Audit event when sensitive
```

## RBAC plus resource scope

RBAC is necessary but insufficient.

Example:

```text
Role: Staff
Permission: booking.read
Tenant: Agency A
Branch scope: Branch 3
```

The user may read booking X only if:
- they are authenticated,
- they belong to Agency A,
- they possess `booking.read`,
- and the booking is within their permitted branch/resource scope.

## Permission naming

Use stable capability names such as:

- `vehicle.read`
- `vehicle.create`
- `vehicle.update`
- `vehicle.archive`
- `booking.read`
- `booking.create`
- `booking.confirm`
- `booking.cancel`
- `booking.extend`
- `inspection.perform`
- `damage.review`
- `payment.read`
- `payment.create`
- `refund.create`
- `pricing.manage`
- `staff.manage`
- `report.read`
- `subscription.manage`

Do not encode plan limits inside role names.

## Tenant isolation

Tenant context must be established from trusted server-side identity/membership, not a client-supplied `tenantId` alone.

Every tenant-owned query must enforce tenant scope. Cross-tenant object IDs must not be useful authorization bypasses.

Background jobs must carry explicit tenant context.

Exports, files, notifications, search, analytics and support must also enforce tenant scope.

## Platform Admin isolation

Platform Admin is a different security domain from Agency Owner.

Agency admins must never gain platform powers by changing a role value client-side or by selecting a different tenant identifier.

Platform administrative APIs should use explicit platform-level guards and separate audit semantics.

## Customer authorization

Customers may access only:
- their own profile
- their own bookings
- documents legitimately belonging to their bookings
- their own support conversations
- customer-facing data intentionally marked public

Customer endpoints must not expose agency internal notes, staff information, financial internals or unrelated customer data.

## Session lifecycle

Support:
- login
- logout current session
- logout all sessions
- token/session rotation
- device/session listing where useful
- revocation after password/security changes
- inactivity/absolute lifetime policy according to risk

## MFA / 2FA

MFA should be prioritized for:
- Platform Admin
- Agency Owner/Admin
- financial/refund-sensitive roles

Possible methods can be added through an authentication provider/adapter.

## Service-to-service authorization

Background workers and scheduled jobs must not impersonate arbitrary end users.

Use explicit service identities/claims plus tenant context and least privilege.

## File access authorization

Signed/private object URLs must be issued only after checking the user/tenant/resource relationship.

Never expose unrestricted document bucket URLs for identity documents, signed contracts or sensitive inspection evidence.

## Audit events

Record sensitive actions such as:
- login/security changes
- role/permission changes
- tenant membership changes
- payment/refund actions
- contract/signature events
- damage/liability decisions
- license/entitlement overrides
- platform suspension/reactivation

Do not put passwords, raw tokens or sensitive document contents into audit records.

## Failure semantics

Prefer not-found semantics for resources where revealing resource existence would leak sensitive cross-tenant information.

All authorization failures should be consistent and observable without exposing internal security details.

## Authorization testing

Mandatory tests include:
- cross-tenant read blocked
- cross-tenant update blocked
- cross-tenant export blocked
- staff cannot perform owner-only action
- customer cannot access agency endpoints
- branch-limited staff cannot access another branch
- platform admin-only endpoints reject agency users
- expired/suspended account behavior
- revoked session/token behavior

## Provider abstraction

Whether the implementation uses a managed authentication provider or a self-managed identity module, domain code must depend on an internal identity/authorization interface rather than scattering provider-specific calls throughout business modules.

## Final architectural rule

**No client-selected role, tenant ID, permission flag, or UI route is authoritative. The backend determines identity, tenant, permissions, resource scope and business eligibility.**
