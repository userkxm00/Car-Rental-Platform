# PHASE-13 — Agency Staff Mobile

## 13-01 Mobile shell/auth/navigation
**Depends:** 12-05. **Skills:** mobile-design-system, rtl-i18n-quality, visual-qa.
**Acceptance:** secure mobile shell, navigation, sessions and design tokens work for agency roles.

## 13-02 Pickup/return workflows
**Depends:** 13-01, 10-05. **Skills:** resilient-mobile-ops, car-rental-domain, visual-qa.
**Acceptance:** staff can execute assigned pickup/return tasks using the same backend business rules.

## 13-03 QR/camera/photo/inspection capture
**Depends:** 13-02. **Skills:** mobile-design-system, resilient-mobile-ops, car-rental-domain.
**Acceptance:** QR lookup and secure evidence capture work; uploads are validated and tenant scoped.

## 13-04 Connectivity/sync + notification foundation
**Depends:** 13-03. **Skills:** resilient-mobile-ops, integration-connector-architecture, testing-quality.
**Acceptance:** safe drafts/retries and sync states are explicit; offline mode never bypasses server authority; minimal push foundation works.

## 13-05 Phase gate
**Depends:** 13-04. **Gate:** supported real-device pickup/return path passes, including QR/photo, auth, sync/error and RTL checks.
