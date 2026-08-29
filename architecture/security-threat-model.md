# Security Threat Model

## Scope

Threats across customer web, agency web, operations mobile, platform admin, API, database, files, payments and integrations.

## Primary assets

- customer identity and documents
- agency/customer/vehicle data
- rental contracts
- inspection/damage evidence
- payment and billing records
- subscriptions/licenses/entitlements
- location data
- authentication sessions/tokens
- audit history

## Highest-risk threats and controls

### Cross-tenant data access
Control:
- trusted tenant context;
- authorization policy;
- tenant-scoped queries;
- defense-in-depth database controls where justified;
- automated isolation tests.

### Broken object-level authorization
Control:
- verify resource ownership/scope for every protected operation;
- never assume possession of an ID implies access.

### Double booking/race conditions
Control:
- transactions;
- conflict constraints/locking strategy;
- idempotency;
- concurrent integration tests.

### Client-side financial tampering
Control:
- server-side calculation;
- immutable booking price snapshots;
- transaction/audit records;
- never trust client totals.

### Payment webhook spoofing/replay
Control:
- signature verification;
- event idempotency;
- persisted provider event identifiers;
- reconciliation.

### Credential/session theft
Control:
- secure cookies/storage appropriate to client;
- short-lived credentials;
- refresh rotation/revocation strategy;
- device/session management;
- MFA for privileged roles.

### File/document exposure
Control:
- private object storage;
- signed/authorized access;
- MIME/type/size validation;
- malware/security scanning where required;
- access audit for sensitive documents.

### API abuse
Control:
- rate limits;
- request size limits;
- input validation;
- pagination;
- abuse detection for public booking/auth endpoints.

### Injection
Control:
- parameterized queries/ORM;
- allowlisted dynamic filters;
- explicit SQL review for PostGIS queries.

### XSS/CSRF
Control:
- framework escaping;
- safe HTML policies;
- secure cookie settings;
- CSRF protection where cookie-authenticated mutation endpoints require it;
- security headers.

### Privilege escalation
Control:
- explicit RBAC/permission policies;
- server-side tenant membership checks;
- audit privileged actions;
- step-up authentication where justified.

### AI data leakage
Control:
- authorize AI data retrieval through the same permissions as normal queries;
- minimize prompt data;
- no cross-tenant context;
- human confirmation for damage/liability decisions.

## Privacy principles

Collect the minimum data needed for rental operations. Keep document access tenant- and role-scoped. Define retention/deletion policies before production.

Do not expose precise live vehicle/customer locations publicly by default.

## Secrets

- Never commit credentials.
- Use runtime secret injection.
- Separate local/test/staging/production secrets.
- Rotate compromised credentials.

## Logging

Logs must be structured and useful without capturing passwords, raw tokens, OTPs, full payment secrets, or unnecessary sensitive document contents.

Security events and audit events are distinct concepts but can share correlation IDs.

## Security testing

Required before production:
- authentication tests
- authorization matrix tests
- tenant isolation tests
- input validation tests
- rate-limit tests
- payment webhook replay/idempotency tests
- file upload tests
- concurrency tests for booking/payment commands
- dependency/security scanning
- E2E privileged-flow tests

## Security baseline

No security control may rely only on obscurity of URLs or frontend behavior.
