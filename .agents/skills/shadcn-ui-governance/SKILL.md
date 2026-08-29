---
name: shadcn-ui-governance
description: Build and govern accessible, composable React UI components when the web stack adopts shadcn/ui. Use for buttons, forms, dialogs, tables, command menus, navigation, themes, and component composition.
---

# shadcn/ui Governance

Treat shadcn/ui as source-owned components, not an opaque dependency.

## Principles
- Check existing components and shadcn registries before inventing primitives.
- Compose primitives instead of creating giant components.
- Use semantic design tokens rather than raw color values.
- Preserve keyboard navigation and focus visibility.
- Dialogs/sheets/drawers require accessible titles.
- Forms must expose accessible validation state.
- Tables and dashboards need intentional responsive behavior.
- Keep component variants constrained and meaningful.

## Verification
After UI changes check:
- TypeScript/build
- keyboard/focus
- loading/empty/error states
- responsive layout
- Arabic RTL and at least one LTR locale
- visual consistency with the project's design tokens

Reference: official shadcn/ui Agent Skill at https://github.com/shadcn-ui/ui/tree/main/skills/shadcn
