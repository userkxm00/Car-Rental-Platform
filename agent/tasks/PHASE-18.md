# PHASE-18 — Security & Reliability Hardening

## 18-01 Threat-model remediation
**Depends:** 17-05. **Skills:** agent-skill-security, testing-quality.
**Acceptance:** all material findings from threat model/security review have remediation or documented exception.

## 18-02 Security/tenant regression suite
**Depends:** 18-01. **Acceptance:** authentication, authorization, IDOR/BOLA, tenant isolation, uploads, secrets and sensitive actions are regression-tested.

## 18-03 Performance/load/abuse
**Depends:** 18-02. **Skills:** testing-quality, postgres-production.
**Acceptance:** critical API latency/load baselines are measured; booking concurrency and abuse/rate-limit scenarios pass defined thresholds.

## 18-04 Backup/recovery/observability drills
**Depends:** 18-03. **Acceptance:** backup restore, monitoring, alerting, log correlation and failure recovery are tested in production-like conditions.

## 18-05 Phase gate
**Depends:** 18-04. **Gate:** critical security, performance, recovery and observability checks pass with evidence.
