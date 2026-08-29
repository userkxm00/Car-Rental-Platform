---
name: frontend-design-review
description: Review and build Car Rental Platform frontend interfaces with production-grade visual quality, clear hierarchy, accessibility, responsive behavior, and design-system consistency. Use for customer marketplace pages, agency dashboards, forms, tables, calendars, maps, mobile layouts, design critiques, and UI PR reviews.
---

# Frontend Design Review

Treat the interface as a product, not a template.

## Required before implementation
- Read the relevant product/UX specification.
- Inspect existing components and design tokens before creating new ones.
- Identify the primary user task and primary action.
- Check Arabic RTL, French, and English states.
- Check mobile and desktop behavior.

## Quality pillars
1. Insight → action: primary task is obvious and fast.
2. Visual craft: intentional typography, spacing, hierarchy, density, states, and motion.
3. Trust: prices, availability, errors, loading, permissions, and AI-assisted content are transparent.
4. Accessibility: keyboard/focus, labels, contrast, semantic structure, screen-reader behavior, reduced motion.
5. Responsive correctness: no horizontal overflow, broken tables, clipped map controls, or unusable touch targets.

## Car-rental-specific checks
- Search results must make availability, total price, location, agency, rating, and key policies understandable.
- Agency profile must clearly separate agency identity from platform identity.
- Calendars/schedulers must make booking conflicts visually obvious.
- Operational mobile screens must optimize for one-handed use and fast staff actions.
- Critical financial/contract/inspection actions must not be visually buried.

## Review output
Report:
- blocker issues
- high-impact issues
- polish opportunities
- accessibility findings
- responsive findings
- consistency findings
- recommended next changes

Do not accept generic AI-looking dashboards when a more purposeful information hierarchy is possible.
