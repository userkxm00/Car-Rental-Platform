# 37 — Permission Matrix

## Purpose

Central reference for authorization. A role grants a set of capabilities; tenant/branch/resource scope still applies.

Legend:
- **A** = full/administrative access
- **W** = create/update/execute where policy permits
- **R** = read
- **—** = no access

| Capability | Platform Admin | Agency Owner/Admin | Branch Manager | Staff | Finance | Customer |
|---|---:|---:|---:|---:|---:|---:|
| Manage platform agencies | A | — | — | — | — | — |
| Manage plans/licenses | A | — | — | — | — | — |
| Manage agency settings | A* | A | W/R scoped | — | — | — |
| Manage branches | A* | A | R/W scoped | R | — | — |
| Manage customers | A* | A | R/W scoped | R/W operational | R | own linked records |
| Verify customer documents | A* | A | W scoped | W | — | submit own |
| Link customer accounts | A* | A | W scoped | — | — | own linkage |
| View fleet | A* | A | R/W scoped | R/W operational | R | — |
| Create/edit vehicles | A* | A | W scoped | limited | — | — |
| Manage vehicle documents | A* | A | W scoped | W operational | — | — |
| View booking | A* | A | R/W scoped | R/W operational | R | own only |
| Create manual booking | A* | A | W scoped | W | — | own web flow |
| Confirm/cancel booking | A* | A | W scoped | policy-scoped | — | request cancellation |
| Extend rental | A* | A | W scoped | W | — | request/self-service where enabled |
| Pickup/return workflow | A* | A | W scoped | W | — | — |
| Inspections/damage | A* | A | W scoped | W | R where needed | own evidence/history |
| Maintenance | A* | A | W scoped | W operational | R | — |
| Pricing rules | A* | A | policy-scoped | R | — | view quote only |
| Payments | A* | A | R/policy-scoped | limited recording | A | own payments/status |
| Refunds/financial adjustments | A* | A | —/policy | — | A | request/support |
| Invoices/receipts | A* | A | R | R | A | own |
| Staff management | A* | A | W scoped | — | — | — |
| Reports | A* | A | R scoped | limited operational | A | own history |
| Support tickets | A* | A | W scoped | W | W billing-related | own |
| Tenant billing/subscription | A* | A | — | — | R | — |
| Feature flags/entitlements | A | A view | — | — | — | — |
| Audit logs | A* | R/W within tenant as policy | R scoped | limited | R financial | — |

`A*` means platform-level visibility must remain explicit and may require separate platform policy/audit, rather than automatically implying access to every sensitive tenant record.

## Scope rules

Role permissions are necessary but not sufficient.

A privileged operation should pass:

```text
Authenticated user
    ↓
Role/permission
    ↓
Tenant membership
    ↓
Branch scope
    ↓
Resource ownership
    ↓
Business rule
    ↓
Plan/entitlement where relevant
```

## Least privilege

Staff should receive operational access, not unrestricted financial/administrative access.

Branch Manager should not automatically manage another branch.

Finance should not automatically modify vehicle operations.

Agency Owner/Admin controls only their agency, never the platform itself.

## Sensitive actions requiring stronger controls

- refunds
- financial adjustments
- license/plan overrides
- staff role changes
- data export
- platform suspension/reactivation
- deletion/archival of high-value records
- changes to pricing rules

These should have explicit permissions and audit events.

## Permission naming

Use stable capability names rather than UI labels. UI screens map to capabilities; authorization logic must not depend on page names.
