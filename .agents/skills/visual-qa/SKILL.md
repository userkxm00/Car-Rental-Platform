---
name: visual-qa
description: Perform rendered visual QA for web interfaces using a real browser. Use after significant UI work, responsive changes, RTL changes, maps, calendars, forms, dashboards, or design-system changes.
---

# Visual QA

## Required loop
1. Start the current app/build.
2. Inspect the target page at desktop and mobile breakpoints.
3. Test the primary interaction path.
4. Capture screenshots when useful.
5. Inspect console errors and failed requests.
6. Check overflow, clipping, z-index, sticky elements, focus, loading, empty, error, and success states.
7. Repeat in Arabic RTL and at least one LTR locale for user-facing pages.

## High-risk Car Rental areas
- Map controls and cards on narrow screens.
- Search/date-time controls.
- Vehicle galleries.
- Booking summaries and price breakdowns.
- Calendar/scheduler density.
- Inspection camera/photo workflows on mobile.
- Agency profile pages.

## Done means
- No blocking console errors.
- No obvious responsive regressions.
- Primary task is usable by mouse, keyboard, and touch as applicable.
- Visual behavior matches the established design system.
