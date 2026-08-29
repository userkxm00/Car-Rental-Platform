---
name: ui-ux-pro-max-adapted
description: Use design intelligence for professional, non-generic UI/UX across the Car Rental Platform. Trigger for new pages, redesigns, landing pages, marketplace search, dashboards, mobile operations, visual hierarchy, responsive states, accessibility, or design-system decisions.
---

# UI/UX Pro Max — Project Adaptation

Use the product specifications and design system as the source of truth. This skill provides decision discipline, not permission to invent product behavior.

## Design process

Before implementation:
1. Identify surface: customer marketplace, agency dashboard, agency mobile, or platform admin.
2. Identify primary user goal and highest-value action.
3. Gather existing design tokens/components before creating new ones.
4. Define information hierarchy, states, responsive behavior, and RTL/LTR behavior.
5. Prefer a coherent visual direction over generic card grids.

## Car-rental priorities

- Marketplace search must make location, dates, availability, price, agency identity, rating and key policies easy to scan.
- Agency profiles must feel trustworthy and distinct while staying inside the shared brand system.
- Operational dashboards prioritize action, exceptions and timing over decoration.
- Rental status, payment state, availability and document expiry need clear semantic states.
- Vehicle galleries should support structured views such as exterior/interior/trunk where configured.
- Forms for booking, vehicles, pricing and inspection must minimize input errors.
- Mobile operations must support thumb-friendly controls, camera/QR flows and clear offline/sync status.

## Visual quality rules

- Avoid generic template-like UI, excessive cards, arbitrary gradients, and inconsistent spacing.
- Use deliberate typography hierarchy, spacing rhythm, density, and visual grouping.
- Do not use color alone to communicate status.
- Design loading, empty, error, success, disabled, permission-denied and offline states.
- Preserve fast scanning for tables/calendars/schedulers.

## Localization

Every user-facing surface must work in Arabic RTL, French, and English. Test mixed-script values, long translations, numbers, dates, and DZD formatting.

## Accessibility

Keyboard navigation, focus visibility, labels, semantic controls, sufficient contrast, touch target sizing and reduced-motion considerations are part of completion.

## Review gate

Before calling a UI task done, inspect the rendered result at representative desktop and mobile widths in both RTL and LTR, then run the visual-qa skill.

## Reference inspiration

Concepts adapted from `nextlevelbuilder/ui-ux-pro-max-skill` (MIT) and related frontend design skills. Do not treat the upstream repository as project source of truth.
