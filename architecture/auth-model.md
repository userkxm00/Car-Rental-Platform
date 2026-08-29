# Identity, Authentication & Authorization Model

## Goals

Provide one authoritative identity model for Customer Web, Agency Operations App, Owner/Admin Web, and the future Customer App while strictly separating platform-admin and agency authorization.

## Core concepts

```text
User
  └── Membership(s)
        ├── Tenant / Agency
        ├── Role(s)
        └── Permission(s)
```

A user is a person/account identity. A membership connects that user to an agency tenant. Roles and permissions are evaluated in the context of the relevant tenant.

Platform administration is a separate privileged security context.

## Authentication requirements

Release 1 should support:
- secure email/password sign-in;
- verified email where applicable;
- phone/OTP support as a planned capability for regional usability;
- password reset;
- session/device management;
- logout/revocation;
- optional MFA for privileged roles;
- suspicious-login / rate-limit protection.

The final authentication provider is an ADR decision after evaluating portability, mobile support, tenant needs, recovery, MFA, and operational cost.

## Sessions and tokens

Clients must use secure, short-lived access credentials with a controlled refresh/session mechanism. Tokens must not contain authoritative tenant permissions that cannot be revoked server-side.

Web and mobile storage must follow platform-appropriate secure storage practices. Never store secrets in localStorage when a safer mechanism is available for the chosen web architecture.

## Authorization

Authorization answers:
1. Is the user authenticated?
2. What security context is active?
3. Which tenant is in scope?
4. Which roles/memberships apply?
5. Does the user have the required capability?
6. Does the target resource belong to the authorized scope?

Client-selected tenant IDs, role IDs, or resource IDs never grant authority.

## Role baseline

Platform:
- Platform Admin

Agency:
- Agency Owner/Admin
- Branch Manager
- Operations Staff
- Finance

Customer:
- Customer

Roles are bundles of permissions, not hard-coded checks scattered across controllers.

## Permission vocabulary

Use resource/action capabilities such as:
- vehicle.read
- vehicle.create
- vehicle.update
- vehicle.archive
- booking.read
- booking.create
- booking.confirm
- booking.cancel
- booking.extend
- payment.read
- payment.create
- payment.refund
- report.read
- staff.manage
- pricing.manage
- branch.manage
- license.manage (platform only)

The final permission catalog is maintained in `docs/37-permission-matrix.md` and implementation constants/types.

## Tenant isolation

Every agency API request must resolve tenant context from trusted server-side identity/membership state.

All tenant-owned reads/writes/exports/jobs must enforce the same scope.

High-risk resources should be protected by defense in depth, including application authorization and evaluation of PostgreSQL Row Level Security where it provides meaningful additional safety.

## Platform Admin boundary

Platform Admin is never an agency role.

Platform operations such as:
- agency suspension;
- plan/entitlement changes;
- license issuance;
- feature flags;
- global support actions;

must require platform-level authorization and create audit events.

## Multi-role users

A person can have multiple memberships and roles. The backend must not infer the active tenant from a client-only value.

Example:

```text
User 123
  ├── Customer account
  └── Agency A membership → Staff
```

When operating Agency A resources, the request must carry an explicit agency context that the server verifies against the membership.

## Privileged actions

Require stronger controls for:
- refunds;
- changing subscription/entitlement state;
- deleting/archiving important records;
- exporting large customer datasets;
- changing roles/permissions;
- accessing sensitive documents;
- platform-wide support actions.

MFA/step-up authentication can be required when justified.

## Device management

The Operations App must support:
- device registration;
- multiple devices per user where policy allows;
- remote session/device revocation;
- push-token rotation;
- last-seen metadata;
- logout from all sessions for security events.

## Auth events

Audit relevant security events:
- login success/failure where policy requires;
- password reset;
- MFA enrollment/use;
- session revocation;
- role/membership changes;
- privileged actions;
- unusual access/security blocks.

Avoid logging passwords, raw access tokens, OTP values, or unnecessary identity secrets.

## API rule

Authentication middleware identifies the principal; authorization guards/policies and domain services enforce what that principal may do. Business services must not trust role/tenant data supplied in the request body.
