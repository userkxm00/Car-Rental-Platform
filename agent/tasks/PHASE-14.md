# PHASE-14 — Customer Mobile (Release 2+)

## 14-01 Mobile foundation/auth shell
**Depends:** 13-05. **Acceptance:** separate customer mobile client consumes approved APIs with secure auth; no duplicated domain truth.

## 14-02 Search/booking parity
**Depends:** 14-01, 07-05. **Acceptance:** customer mobile search and booking behavior matches web contracts and server pricing/availability.

## 14-03 Check-in/QR/support
**Depends:** 14-02, 10-05. **Acceptance:** digital check-in, QR and support flows respect permissions and booking lifecycle.

## 14-04 Cross-client contract tests
**Depends:** 14-03. **Acceptance:** web/mobile contract tests cover core booking/pricing/auth behavior.

## 14-05 Phase gate
**Depends:** 14-04. **Gate:** customer mobile is release-ready without divergence from authoritative backend behavior.
