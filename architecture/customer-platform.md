# Customer Platform — 07-A Customer Identity & Profile

Phase 07 workstream 07-A implementation record. Authority: `architecture/database-schema-v1.md` §5 (customer tables), `architecture/authentication-authorization.md` ("Customer and agency overlap"), `docs/37-permission-matrix.md` (Customer column), WBS `agent/IMPLEMENTATION-WBS-V2.md` 07-A01…A07.

## Data model (07-A01, migration `20260901000000_customer_identity`, #17)

- `customers` — tenant-scoped business customer master. Fields per schema-v1 §5.1 plus the R1 jurisdiction baseline: `licenseNumber`, `licenseCountry` (ISO 3166-1 alpha-2, defaults to `DZ` when a license is recorded), `licenseIssueDate`, `licenseExpiryDate`, `preferredLocale` (ar/fr/en), `status` (ACTIVE/SUSPENDED/ARCHIVED).
- Uniqueness is policy-driven (schema-v1 §5.1): the same person may legitimately exist in multiple tenants. The only hard invariants are `@@unique([tenantId, userId])` (one platform-account link per tenant; NULLs are distinct in PostgreSQL) and `@@unique([customerId, type])` on documents (one document record per type — re-issuing updates the record in place and resets verification).
- `customer_documents` — identity/eligibility evidence per customer. `status` ∈ PENDING/VERIFIED/REJECTED; `mediaObjectId` is a plain UUID reference until the `media_objects` storage table lands (03-C follow-up); verification is manual (agency staff), recorded with `verifiedAt`/`verifiedBy`/`rejectionReason`.
- `customer_favorites`, `recently_viewed_vehicles`, `search_history` — user-scoped marketplace signals (07-A05…A07). Favorites and recently-viewed are unique per (user, vehicle); search history stores a bounded JSON criteria snapshot.

## Identity model decisions

1. **The marketplace customer account is the application `User`** (authentication-authorization.md: one user may be a customer and hold agency memberships; no duplicate users per surface). `customers.userId` links a platform account to an agency's business record (07-A02) — staff link by verified email; the booking flow will auto-create/link records with the 07-E portal.
2. **Since 07-E05, bookings reference the tenant's customer record.** `bookings.customerId` is a FK to `customers` (migration `20260902010000_booking_customer_retarget`, #20) with `ON DELETE SET NULL`; the `User.bookingsAsCustomer` back-relation is gone and `Customer.bookings` is the owner side. Confirmation requests validate a supplied `customerId` against the booking's own tenant (`BOOKING_CUSTOMER_NOT_FOUND` otherwise); omitted/null customer ids still flow for walk-in/import attach. `bookings.createdBy` keeps the audit link to the platform user, and `customers.userId` is the bridge between the two identities.
3. **Documents verification is staff-manual and staff-immutable once VERIFIED.** Customers submit (PENDING), correct data while not verified, and resubmit after rejection (REJECTED → PENDING). Metadata edits by either side reset verification to PENDING — changed evidence is unverified evidence.
4. **R1 document requirements baseline** (07-A04): a driving rental requires a VERIFIED, unexpired `DRIVER_LICENSE`; other types (NATIONAL_ID, PASSPORT, RESIDENCE_PERMIT, OTHER) are collected on agency policy without blocking. The computation is a pure function (`computeDocumentRequirements`) exposed on the customer detail response; per-agency requirement configuration can replace the baseline later without changing the state model.

## API surface (both under `/api/v1`)

Agency-side (`agencies/:agencyId/customers`, `AgencyScopeGuard` + `PermissionGuard`):

| Route | Permission | Purpose |
|---|---|---|
| POST `/` | `customer.manage` | create customer record |
| GET `/` (search/status/limit/offset) | `customer.read` | tenant-scoped list |
| GET `/:customerId` | `customer.read` | detail + documents + requirements state |
| PATCH `/:customerId` | `customer.manage` | update record |
| POST/DELETE `/:customerId/link` | `customer.link` | link/unlink platform account (07-A02) |
| POST/GET `/:customerId/documents` | `customer.manage` / `customer.read` | document records |
| PATCH `/:customerId/documents/:documentId` | `customer.manage` | metadata edit (resets to PENDING) |
| POST `/:customerId/documents/:documentId/verify` | `customer.document.verify` | PENDING → VERIFIED/REJECTED |

Self-service (`me/…`, authenticated own-only; the caller identity comes from the verified token, never client input):

| Route | Purpose |
|---|---|
| GET `me/customers` | own linked records across agencies |
| GET/PATCH `me/customers/:customerId` | own record + profile settings (07-A03; `status` is never self-settable) |
| GET/POST/PATCH `me/customers/:customerId/documents` | own documents (verified ones staff-immutable) |
| GET/PUT/DELETE `me/favorites[/:vehicleId]` | favorites (07-A05, cross-agency) |
| POST/GET/DELETE `me/recently-viewed` | recently viewed (07-A06, upsert + cap 20) |
| POST/GET/DELETE `me/search-history` | search history (07-A07, snapshot + cap 50) |

Customer booking portal (07-E, authenticated non-member surface — same own-only
identity rules; agency references are public slugs resolved through the
marketplace participating-agency rules):

| Route | Purpose |
|---|---|
| POST `me/quotes` | quote for a public agency (`agencySlug`), channel forced to `MARKETPLACE` (07-E04) |
| GET `me/quotes[/:quoteId]` | own quotes only, creator-scoped reads (07-E04) |
| POST `me/customers/ensure` | resolve-or-create own customer record per agency — idempotent, unique per (tenant, user) (07-E05) |
| POST `me/bookings` | DRAFT booking from an own unexpired quote (`QUOTE_EXPIRED` otherwise); tenant derived server-side; idempotency-key replay (07-E08) |
| GET `me/bookings[/:bookingId]` | own reservations with agency slug (07-E09) |
| POST `me/bookings/:bookingId/confirm` | confirmation request; supplied `customerId` must belong to the booking's tenant (07-E05/E08) |
| POST `me/bookings/:bookingId/cancel` | customer cancellation, `CUSTOMER` initiator audited (07-E10) |

Authorization additions (permissions.ts/roles.ts): `customer.read` (FINANCE included), `customer.manage` (owner/branch-manager/staff), `customer.link` (owner/branch-manager only — least privilege on account linkage), `customer.document.verify` (owner/branch-manager/staff). The CUSTOMER role bundle is unchanged: self-service endpoints are own-only by identity, not by permission.

## Validation & error codes

All boundary validation is pure and clock-injected (`customers/domain/customer-rules.ts`): names 1–80, phone/email shapes, locales ar/fr/en, ISO dates (issue dates not in the future, issue ≤ expiry), ISO-3166 country codes, document type/status catalogs, verification state machine (PENDING → VERIFIED|REJECTED; VERIFIED|REJECTED → PENDING), expiry detection (`expired` is derived, never stored). Stable 409/404 codes in `customer-contract.ts` (`CUSTOMER_*`, `DOCUMENT_*`, `USER_*`, `FAVORITE_*`, `VEHICLE_NOT_FOUND`, `SEARCH_CRITERIA_INVALID`).

## Verification (07-A sweep)

- Unit: `customer-rules.spec.ts` (16), `customers.service.spec.ts` (17), `customer-self.service.spec.ts` (18) — 51 tests: validation matrices, linkage invariants (taken/already-linked/disabled), verification transitions, own-only resolution, caps.
- e2e `test/customers.e2e-spec.ts` (17, JWKS port 4150): CRUD over HTTP with role matrix (staff manage, finance read-only, staff link denied), cross-tenant 403 isolation, link-by-email round-trip incl. one-link-per-tenant, document lifecycle with verification + requirements state flip, self-service profile/documents/favorites/recently-viewed/search-history with cross-user 404s.
- Full regression: typecheck 0, build 0, lint 0 (all new production + test code), unit 407 (36 suites), e2e 192 (24 suites).
