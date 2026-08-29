---
name: mobile-design-system
description: Build and maintain the Agency Operations mobile design system with Expo/React Native. Use for mobile screens, reusable components, tokens, navigation layouts, forms, inspection/photo workflows, QR flows, and responsive states.
---

# Mobile Design System

Create one visual source of truth for the operations app.

## Tokens
Define and reuse:
- color semantics
- typography
- spacing
- radius
- elevation/shadow
- motion
- touch target sizes
- status/state colors

## Components
Prefer reusable components for:
- task cards
- status badges
- inspection rows
- photo slots
- QR actions
- vehicle/customer summaries
- confirmation sheets
- error/retry banners

## Mobile-specific rules
- Respect safe areas.
- Optimize for one-handed staff operation.
- Keep primary operational actions obvious.
- Use native-feeling controls where helpful.
- Handle loading, offline/pending-sync, success, and failure states explicitly.
- Never make a critical action depend on tiny tap targets.
- Preserve Arabic RTL behavior when locale changes.

## References
Inspired by Expo's open-source `expo-design-system` and `expo-native-ui` skills; use the project's accepted stack and pin actual SDK versions during implementation.
