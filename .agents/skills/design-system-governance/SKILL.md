---
name: design-system-governance
description: Maintain a coherent design system across customer marketplace, agency web, platform admin, and agency mobile. Use when creating or changing reusable UI primitives, layouts, forms, tables, navigation, themes, tokens, states, or component variants.
---

# Design System Governance

## Principles
- Prefer existing components before creating new primitives.
- Use semantic design tokens instead of hard-coded visual values.
- Compose accessible primitives rather than duplicating interaction logic.
- Keep visual language consistent across web surfaces while allowing role-specific density.

## Required system layers
- color tokens: semantic, not component-specific hacks
- typography scale
- spacing scale
- radii/elevation rules
- iconography
- focus/hover/pressed/disabled states
- loading/empty/error/success states
- light/dark theme strategy where enabled
- RTL-aware directional tokens/layouts

## Component rules
- Components expose predictable APIs and variants.
- Avoid prop explosion; prefer composition.
- Forms must expose validation state accessibly.
- Dialogs/drawers must have accessible titles.
- Tables, calendars, and dashboards must preserve usability at narrow widths.
- Never introduce a one-off pattern when an existing component can express the same intent.

## Car Rental surfaces
Maintain distinct visual priorities:
- Marketplace: trust, discovery, comparison, photography, location.
- Agency admin: operational density, scanability, exception visibility.
- Agency mobile: speed, touch, camera/QR workflows.
- Platform admin: governance, auditability, controls.
