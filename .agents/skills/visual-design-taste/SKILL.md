---
name: visual-design-taste
description: Prevent generic AI-looking frontend output. Use when creating or reviewing customer-facing pages, dashboards, cards, hero sections, vehicle listings, agency profiles, and mobile screens.
---

# Visual Design Taste

Prioritize product-specific visual decisions instead of default AI templates.

## Require before coding
- Define the page's job and the visual emphasis.
- Identify the product-specific content that should drive composition: vehicle imagery, price, availability, location, agency trust, booking action, operational urgency.
- Reuse the existing design system and avoid one-off visual styles.

## Avoid
- Repetitive card grids when a table/list/timeline is more useful.
- Decorative gradients or glass effects without a product reason.
- Oversized headings that reduce useful content density.
- Arbitrary color usage or inconsistent corner radii/shadows.
- Placeholder-looking fake content in production surfaces.

## Encourage
- Strong hierarchy and purposeful whitespace.
- High-quality vehicle/agency imagery with meaningful cropping and object positioning.
- Clear comparison between price, availability, distance and trust signals.
- Distinct but restrained states for available, reserved, maintenance, pending and blocked.
- Responsive compositions designed deliberately for both desktop and mobile.

## Arabic/RTL
Design direction must remain natural in RTL; do not simply mirror an LTR page mechanically. Validate mixed Arabic/French/Latin content.

## Completion
Rendered UI must be checked with `visual-qa` and `frontend-design-review`.

## Source
Adapted from `Leonxlnx/taste-skill` (MIT) after repository-level review. It is a design-process reference, not an implementation dependency.
