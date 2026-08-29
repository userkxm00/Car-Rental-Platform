# PHASE-07 — Customer Platform & Marketplace

## 07-01 Customer profile/public exposure
**Depends:** 06-05. **Skills:** car-rental-domain, nestjs-production, frontend-design, rtl-i18n-quality.
**Acceptance:** customer identity/profile and agency public exposure controls work; private agency data remains hidden.

## 07-02 Marketplace search/map-list
**Depends:** 07-01. **Skills:** maps-postgis, frontend-design, ui-ux-pro-max-adapted, visual-design-taste, visual-qa, api-contracts.
**Acceptance:** cross-agency search returns only eligible/bookable offers; map/list synchronization and filters work.

## 07-03 Agency profiles/offers
**Depends:** 07-02. **Skills:** frontend-design, business-application-ux, design-system-governance, rtl-i18n-quality.
**Acceptance:** agency profile and agency-owned vehicle pages expose correct public inventory, policies, locations and trust data.

## 07-04 Quote/checkout/reservation portal
**Depends:** 07-03. **Skills:** car-rental-domain, api-contracts, financial-auditability, frontend-design, testing-quality.
**Acceptance:** customer can quote, request/book, see transparent totals, payment method, documents and reservation history safely.

## 07-05 Phase gate
**Depends:** 07-04. **Gate:** customer can discover, compare, choose an agency offer and create/retrieve a safe reservation without cross-tenant leakage.
