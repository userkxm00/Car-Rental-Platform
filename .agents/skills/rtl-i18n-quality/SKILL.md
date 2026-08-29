---
name: rtl-i18n-quality
description: Implement and review Arabic, French, and English localization as a first-class product concern. Use for layouts, copy, forms, dates, numbers, currencies, validation messages, directionality, and translation changes.
---

# RTL and Internationalization Quality

## Core requirements
- Arabic is true RTL, not merely translated text inside an LTR shell.
- French and English remain natural LTR experiences.
- Layout direction must be derived from locale, not hard-coded per page.
- Use logical CSS properties where possible (start/end instead of left/right).
- Never concatenate translated strings around variables when interpolation is available.
- Keep translation keys stable and namespaced by domain.

## Data formatting
- Format DZD and future currencies with locale-aware formatting.
- Store canonical timestamps consistently; render in the relevant branch/user timezone.
- Do not localize machine identifiers, license keys, booking numbers, or audit identifiers.
- Support pluralization and gender/context where the language requires it.

## UI checks
- Navigation, breadcrumbs, drawers, icons, tables, calendars, maps, and forms mirror correctly in RTL.
- Directional icons must be reviewed individually; not every icon should be mirrored.
- Mixed Arabic/Latin content (plates, VINs, email addresses, URLs, phone numbers) must remain readable.
- Validation and error messages must be translated and actionable.
