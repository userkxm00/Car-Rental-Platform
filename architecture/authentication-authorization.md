# Authentication & Authorization Architecture

## Decision

**Release 1 Authentication Provider: Supabase Auth.**

Supabase Auth is used strictly as the external identity provider for authentication. It is not the source of truth for rental-domain authorization, tenant ownership, memberships, permissions, entitlements, bookings, payments, or other business data.

## Responsibility split

```text
Supabase Auth
  ├── Sign up / sign in
  ├── Email verification
  ├── Password recovery
  ├── Session/token lifecycle
  └── Supported MFA capability
          ↓
Application Identity Boundary (NestJS)
          ↓
User
  ↓
Agency Membership
  ↓
Role
  ↓
Permission
  ↓
Tenant / Branch / Resource scope
  ↓
Business Rules
  ↓
Entitlement / Plan checks where applicable
```

The NestJS backend is authoritative for application identity mapping and all authorization decisions.

## Why this decision

Supabase Auth is preferred for Release 1 because it reduces the amount of security-sensitive authentication infrastructure that the project must implement and maintain while remaining PostgreSQL-aligned and compatible with web and React Native/Expo clients.

The project explicitly avoids using Supabase as a general application backend. The architecture remains centered on NestJS + PostgreSQL + PostGIS + Prisma.

## Application identity boundary

Every Supabase-authenticated principal maps to an application `User` record through a stable provider identity mapping.

Do not scatter Supabase user IDs throughout domain logic.

Domain entities reference the application's user identity.

Recommended conceptual mapping:

```text
Auth Provider Subject
        ↓
ExternalIdentity
        ↓
Application User
        ↓
Membership / Customer / Actor references
```

The application user record is responsible for domain-level profile and lifecycle information.

## Roles and permissions

Minimum roles:

- Platform Admin
- Agency Owner/Admin
- Branch Manager
- Staff/Agent
- Finance where enabled
- Customer

Roles are bundles. Stable fine-grained permissions remain the actual authorization capabilities.

Authorization is evaluated server-side using:

1. authenticated identity
2. active application user state
3. tenant membership
4. role/permission
5. branch/resource scope
6. business rule
7. entitlement/plan policy where relevant

A client must never be able to elevate its own role, tenant, permission or entitlement.

## Sessions and tokens

Browser and mobile authentication may use the session/token mechanisms provided by Supabase Auth, but the application must enforce its own authorization on every protected backend request.

Requirements:

- secure session handling
- token expiration and refresh according to provider mechanisms
- logout/revocation behavior
- password recovery
- verification
- rate limiting on sensitive authentication endpoints
- privileged-account MFA according to the final security policy
- secure mobile token storage using platform-appropriate secure storage

Do not store authentication secrets in ordinary browser local storage when a safer provider/session mechanism is available.

## NestJS integration

The backend must validate the incoming authentication credential/token using the official provider mechanism, then map the authenticated subject to the application user.

Authorization guards must use application identity/membership/permission context, not provider claims alone.

Provider-specific SDK calls must remain inside the infrastructure/auth adapter layer.

Domain services must not depend directly on Supabase SDK types.

## Customer and agency overlap

One application `User` may be a customer and also belong to one or more agencies through explicit memberships.

Do not create duplicate application users merely because the same person uses different product surfaces.

## Platform Admin isolation

Platform administration is a separate authorization boundary.

A user cannot become a Platform Admin by editing a client payload, selecting another tenant, changing a role in the frontend, or modifying provider metadata without server-side authorization.

Platform-level actions require explicit platform permissions and audit events.

## Tenant isolation

Tenant context is derived server-side from authenticated application identity and membership.

A supplied `tenantId` is never sufficient authorization.

Every tenant-owned read/write/export/search/job/file access must enforce tenant scope.

## Provider portability

The domain does not depend on Supabase-specific identifiers or behavior.

A future migration to another identity provider must be possible by replacing the external identity adapter/mapping without redesigning the rental domain.

Provider-specific fields belong in identity/infrastructure boundaries only.

## Testing requirements

Auth implementation is incomplete until tests verify at minimum:

- valid login/session accepted
- invalid/revoked credential rejected
- password recovery flow
- verification behavior
- privileged MFA policy where enabled
- customer cannot access agency-only resources
- agency user cannot access another tenant
- branch-limited user cannot access another branch
- platform-only endpoint rejects agency users
- removed/suspended membership is denied
- logout/revocation invalidates protected access as designed
- provider subject cannot be used to bypass application identity mapping

## Security requirements

- Never trust provider metadata as application authorization.
- Never expose provider admin/service secrets to client applications.
- Never log raw authentication tokens.
- Never use client-selected roles or tenants.
- Rate-limit authentication and recovery flows.
- Keep provider SDK integration isolated.

## Migration rule

If the project changes authentication providers later, the change requires an ADR and migration plan. The application identity model remains stable.

## Final decision

**Use Supabase Auth for Release 1 authentication only. Keep NestJS + PostgreSQL as the authoritative application/domain platform.**
