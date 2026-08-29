---
name: frontend-design
description: Create distinctive, production-grade customer marketplace and agency/admin interfaces. Use when designing or implementing React web pages, dashboards, forms, search, booking flows, responsive layouts, accessibility, typography, RTL, or visual systems.
---

# Frontend Design Skill

## Product-specific direction

Design for a real rental marketplace and operating platform, not a generic dashboard template. Every important page needs a clear primary job and a visible next action.

## Customer Web

Prioritize:
- search-first discovery;
- Map/List parity;
- agency trust and profile information;
- transparent price breakdowns;
- availability clarity;
- mobile-first responsive behavior;
- low-friction booking.

## Agency Web

Prioritize dense operational information without visual clutter:
- attention/exception center;
- calendar/timeline;
- fleet states;
- financial status;
- quick actions;
- keyboard/mouse efficiency.

## RTL and localization

Arabic is first-class, not a mirrored afterthought. Avoid hard-coded left/right assumptions, fixed text widths, concatenated translated strings, or icon placement that breaks in RTL. Test Arabic, French, and English layouts with realistic labels.

## Accessibility

Use semantic HTML, visible focus states, keyboard access, sufficient target sizes, form labels/errors, meaningful loading/empty/error states, and accessible map/list alternatives.

## Visual quality

Avoid generic AI-generated UI patterns. Establish a deliberate visual system: typography hierarchy, spacing scale, component states, icons, motion only where useful, and consistent information density.

## External reference

Adapted conceptually from Anthropic's public `frontend-design` Agent Skill. The project-specific rules above are authoritative for this repository.
Source: https://github.com/anthropics/skills/tree/main/skills/frontend-design
