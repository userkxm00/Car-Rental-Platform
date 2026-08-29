# API Architecture — Baseline

## Principles

The API is the authoritative application boundary for web and mobile clients.

- Versioned API, initially `/api/v1`.
- JSON request/response contracts unless a binary upload/download requires another mechanism.
- Server-side validation for every untrusted input.
- Authorization before protected domain operations.
- Idempotency for retryable financial and booking mutations where appropriate.
- Consistent error envelope.
- Pagination/filter/sort conventions are standardized.
- OpenAPI is generated/maintained as a contract artifact.

## High-level resource groups

```text
/api/v1/auth
/api/v1/users
/api/v1/agencies
/api/v1/branches
/api/v1/locations
/api/v1/vehicles
/api/v1/vehicle-categories
/api/v1/availability
/api/v1/quotes
/api/v1/bookings
/api/v1/customers
/api/v1/contracts
/api/v1/inspections
/api/v1/damages
/api/v1/maintenance
/api/v1/payments
/api/v1/invoices
/api/v1/notifications
/api/v1/tasks
/api/v1/support
/api/v1/analytics
/api/v1/files
/api/v1/entitlements
```

Platform-owner endpoints should be isolated by namespace/security policy rather than mixed into agency/customer resource handlers.

## Request lifecycle

```text
HTTP Request
  ↓
request ID / correlation ID
  ↓
authentication
  ↓
tenant + membership context
  ↓
permission authorization
  ↓
input validation
  ↓
domain command/query
  ↓
database transaction if required
  ↓
audit/event emission
  ↓
response
```

## Validation

Use shared validation schemas/contracts where appropriate. Never trust:

- tenant IDs
- user IDs
- resource ownership claims
- prices/totals
- permissions
- status transitions
- payment amounts
- discount amounts

## Error contract

Errors should be machine-readable and localized for user-facing messages.

Conceptual format:

```json
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "The selected vehicle is no longer available.",
    "details": {},
    "requestId": "..."
  }
}
```

Do not leak stack traces, secrets, or sensitive internal state to clients.

## Booking mutations

Critical mutations should support idempotency where retries are likely:

- create booking
- confirm booking
- payment operations
- refund requests
- webhook processing
- extension

The exact idempotency storage/expiry strategy is a later implementation detail.

## Pagination/filtering

Use a consistent pattern for collection endpoints. Large datasets must never be returned unbounded.

Filters must be authorization-aware; a filter must not become a cross-tenant discovery mechanism.

## Files

Large file uploads use controlled upload flows. The API creates/authorizes an upload target, while object storage receives the actual bytes where supported.

File metadata and ownership remain in PostgreSQL.

## Realtime

Realtime functionality is optional and event-driven. Suitable candidates:

- booking status updates
- operational task updates
- support chat/messages
- urgent alerts

Realtime is not authoritative; PostgreSQL/API state remains authoritative.

## Webhooks

Provider webhooks must:

- authenticate/verify provider signatures where supported
- be idempotent
- persist receipt/reconciliation state
- avoid trusting client-provided callbacks
- safely retry transient failures

## API security baseline

- HTTPS in production
- secure authentication/session handling
- CSRF strategy where cookie-based browser auth requires it
- CORS restricted to known application origins
- rate limiting
- abuse protection on public search/auth endpoints
- input validation
- authorization at resource level
- safe logging
- security headers at deployment/proxy layer

## API evolution

Breaking changes require a documented versioning/deprecation strategy. Mobile clients may remain on an older supported API contract for a controlled period.

## OpenAPI

OpenAPI should describe:
- endpoints
- request schemas
- response schemas
- authentication requirements
- error codes
- pagination/filter conventions

The specification must be generated or checked in CI so implementation drift is detected.
