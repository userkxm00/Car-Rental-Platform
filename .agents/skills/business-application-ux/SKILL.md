---
name: business-application-ux
description: Apply proven enterprise business-software UX patterns when building agency/admin interfaces. Use for data-dense lists, forms, filters, dialogs, saved views, workflows, permissions, reports, and consistent application shells.
---

# Business Application UX

Use domain semantics before choosing screens. Keep list/detail/form workflows consistent across the product.

## Rules
- Prefer clear entities, states, actions and ownership over decorative UI.
- Tables need useful columns, sorting, filtering, pagination, loading, empty and error states.
- Forms should group fields by task and preserve context; validation should be actionable and localized.
- Destructive actions require explicit labels and confirmation appropriate to risk.
- Workflow/state changes must reflect domain permissions and current state; UI never invents transitions.
- Dashboards summarize authoritative backend data and link to actionable detail.
- Reports should be designed for operational decisions; avoid vanity metrics.
- Consider saved filters/views and configurable reporting for mature agency operations, but keep them outside MVP unless approved by scope.
- Reuse the project's design system instead of introducing a second component language.
- Arabic RTL, French and English are first-class.

## Car Rental examples
- Fleet list: availability/readiness/status must be immediately understandable.
- Booking list: pickup, return, customer, vehicle, status, payment state and exception flags should be scannable.
- Agency profile: trust, location, policies, rating and own fleet should be clearly separated.
- Platform admin: tenant lifecycle, billing, entitlements and moderation should remain separate from agency operations.

Source inspiration: Frappe Framework / ERPNext / Frappe UI (MIT). This skill is a local adaptation; do not treat those projects as implementation dependencies.
