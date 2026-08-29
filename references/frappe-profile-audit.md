# Frappe / ERPNext Profile Audit

## Scope
Audited repositories: `frappe/frappe`, `frappe/erpnext`, `frappe/frappe-ui`.

## High-value patterns for Car Rental Platform

### Frappe Framework
- Metadata/semantics-first modeling: describe business entities and meaning explicitly rather than hard-coding screens.
- Built-in role/permission thinking and server-side access control.
- Consistent list/form/view patterns for business software.
- Report-builder mindset: operational users need configurable reporting, not only fixed dashboards.
- Strong documentation and self-hosting/managed-hosting separation.

### ERPNext
- Cross-module business workflows with shared accounting/customer/order concepts.
- Centralized operational records that connect transactions, parties, assets, and reporting.
- Asset lifecycle thinking maps well to rental vehicles: acquisition → availability → booking → maintenance → retirement.
- Mature approach to permissions, reporting and workflow states.

### Frappe UI
- Reusable component library and utility-first UI infrastructure for business applications.
- Useful reference for dense tables, forms, dialogs, dropdowns and application-shell consistency.
- MIT-licensed repository; it is a Vue library, so patterns are references only because this project uses React/TypeScript.

## What we adopt
- Semantic/domain-first modeling.
- Reusable business-application UI primitives.
- Configurable reports and saved views as a future capability.
- Explicit lifecycle/workflow state machines.
- Strong server-side permissions and auditable actions.
- Consistent list/detail/form patterns across agency operations.

## What we do NOT adopt
- Frappe/Python/MariaDB stack.
- Frappe Framework as a dependency.
- Vue/Frappe UI as the project's frontend stack.
- ERPNext's broad ERP scope.

## Architectural fit
These references influence product and UX patterns only. Our source of truth remains the Car Rental Platform ADRs and specifications: NestJS modular monolith, TypeScript, PostgreSQL + PostGIS, Prisma, React web, React Native + Expo agency mobile, REST/OpenAPI, and provider-neutral adapters.

Sources:
- https://github.com/frappe/frappe
- https://github.com/frappe/erpnext
- https://github.com/frappe/frappe-ui
