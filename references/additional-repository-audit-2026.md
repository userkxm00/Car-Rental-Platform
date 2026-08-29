# Additional Repository Audit — 2026

Purpose: identify additional repositories worth using as research references for Car Rental Platform. References are not source of truth and are not runtime dependencies unless separately approved.

## High-value references

### MengTo/Skills — DESIGN / AGENT WORKFLOW
https://github.com/MengTo/Skills
Why useful:
- strong design-to-prompt workflow
- reusable agent skills for web/UI work
- publishing/documentation workflow
- practical constraints for agent-generated interfaces
Use for: design workflow, visual references, agent operating patterns.
License: MIT.

### warrengalyen/OpenFleet — FLEET OPERATIONS
https://github.com/warrengalyen/OpenFleet
Why useful:
- fleet/asset management
- inspection → work order lifecycle
- preventive maintenance
- immutable audit log
- role-based auth
- operational reporting
- health checks/correlation IDs
- unit/integration/middleware tests
- Playwright + frontend accessibility documentation
Use for: Agency Operations, Maintenance, Inspection, reporting, observability and QA patterns.
License: MIT.
Do not copy its .NET architecture; our backend remains NestJS/TypeScript.

### navodya0/FMS — FLEET WORKFLOWS
https://github.com/navodya0/FMS
Why useful:
- inspection submission and post-check verification
- approval workflow
- vehicle document expiry dashboards
- rental double-booking protection
- operational roles
- PDF operational documents
Use for: inspection approvals, document reminders, fleet operations.
License status must be checked before any code reuse; prefer ideas/patterns.

### tolgatasci/fleet-management-system — INSPECTION / ACCESS
https://github.com/tolgatasci/fleet-management-system
Why useful:
- inspection templates by vehicle type
- photo evidence attached to inspection items
- compliance tracking
- resource groups / region-based access
- audit logging
Use for: inspection template design, evidence capture and scoped access.

## Already audited high-value references
- aelassas/bookcars — marketplace, multi-supplier, vehicle scheduler, pricing, locations, mobile.
- Mohamed-Galdi/real-rent-car — modern public web, client portal, support, 2FA, admin operations.
- raishudesu/renta-frontend — QR pickup, owner dashboard, PostgreSQL/AWS, tracking concepts.
- SolidMVC/Car-Rental-System — pricing, deposits, fees, locations, reviews and operational rules.
- abdelmoughit555/rental-car — Arabic/French/English, map search, autocomplete, galleries and price history.
- Aggar — marketplace roles, location/search, booking requests, messaging and notifications.
- userkxm00/pos-global — internal reference for atomicity, exact money, auditability, resilience, contracts and evidence.
- frappe/frappe, frappe/erpnext, frappe/frappe-ui — business-application UX/domain patterns; not dependencies.

## Not recommended as dependencies
The repositories above are heterogeneous in frameworks, licenses and scope. For Car Rental Platform, prefer extracting verified patterns into project documentation/skills. Do not clone or install complete repositories into the production codebase merely as references.

## Selection rule
A repository becomes a stronger implementation reference when it demonstrates the same domain workflow and has inspectable tests/docs. A reference does not override our ADRs, business rules or source-of-truth hierarchy.
