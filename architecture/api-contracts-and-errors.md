# API Contracts & Error Model

## API style

Versioned REST API under `/api/v1`.

Business operations are expressed as explicit commands where necessary rather than exposing arbitrary database CRUD.

## Response principles

- Stable machine-readable identifiers.
- Human-readable localized messages are presentation concerns.
- Pagination metadata for collection endpoints.
- Correlation/request ID for support and observability.
- No secret/provider credentials in responses.

## Command examples

```text
POST /api/v1/bookings/quote
POST /api/v1/bookings
POST /api/v1/bookings/{id}/confirm
POST /api/v1/bookings/{id}/cancel
POST /api/v1/bookings/{id}/extend
POST /api/v1/rentals/{id}/checkout
POST /api/v1/rentals/{id}/checkin
POST /api/v1/inspections/{id}/complete
POST /api/v1/payments/{id}/refund
```

Exact endpoint names are finalized per domain specification.

## Authentication

Protected requests require a valid authenticated session/access credential. Authentication identifies the principal; authorization determines tenant/role/permission scope.

## Idempotency

Use idempotency keys for retry-prone commands that can create side effects, including selected booking creation and payment operations.

The API must return the same logical result for the same valid idempotency key instead of creating duplicate business effects.

## Error envelope

Recommended shape:

```json
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "The vehicle is no longer available for the selected period.",
    "details": {},
    "requestId": "..."
  }
}
```

`code` is stable and documented. `message` can be localized. `details` must not leak sensitive information.

## HTTP semantics

Use normal HTTP status semantics consistently:
- 400 invalid request shape
- 401 unauthenticated
- 403 authenticated but not authorized
- 404 resource not visible/not found
- 409 business conflict/concurrency conflict
- 422 semantically invalid business input where appropriate
- 429 rate limited
- 5xx server/provider failures

Never use 200 for an operation that actually failed.

## Pagination

Collection endpoints must have explicit, documented pagination. Cursor pagination is preferred for high-volume event/notification/audit collections; offset pagination may be acceptable for small administrative datasets.

## Filtering/sorting

Filters and sorting must be allowlisted per endpoint. Never interpolate arbitrary client field names into SQL.

## Tenant safety

The server derives tenant scope from trusted identity/membership context. A client-supplied tenant ID is not authoritative.

## Validation

Validate at the API boundary, then enforce domain invariants again inside the application/domain layer. Database constraints protect critical invariants as a final layer where appropriate.

## OpenAPI

The API should publish an OpenAPI contract in non-production/dev tooling and use that contract to keep clients aligned.

Do not expose internal stack traces in production responses.

## Compatibility

`/api/v1` is a compatibility boundary. Breaking API changes require a versioning/deprecation plan and mobile compatibility consideration.
