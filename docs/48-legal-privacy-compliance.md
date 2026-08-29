# 48 — Legal, Privacy & Compliance Baseline

## Purpose

Define product requirements that must be reviewed with qualified local/legal professionals before production launch. This document is an engineering baseline, not legal advice.

## Data categories

The platform may process:
- account/contact details;
- identity and rental documents;
- contracts/signatures;
- payment references and financial records;
- inspection photos and damage evidence;
- support/review content;
- approximate/precise location where necessary and authorized;
- audit/security events.

## Required policies before public launch

- Terms of Service.
- Privacy Policy.
- Cookie/consent policy where applicable.
- Data retention and deletion policy.
- Customer/agency responsibility boundaries.
- Marketplace verification/disclaimer policy.
- Review/moderation policy.
- Document/identity handling policy.
- Security incident/data-breach response procedure.

## Engineering requirements

Data access must follow least privilege and tenant scope. Sensitive documents must use private storage with controlled access. Logs must avoid passwords, tokens, OTP values and unnecessary identity/document contents.

Retention periods must be configurable by data class where required. Deletion must preserve records that must legally or operationally remain immutable, using appropriate anonymization or retention rules instead of destructive deletion.

## Regional readiness

Algeria is the initial market. Before launch, validate applicable Algerian requirements for personal-data processing, consumer terms, electronic transactions, taxation/invoicing, retention, and sector-specific rental obligations. Before expanding to Morocco/Tunisia, perform country-specific legal review rather than assuming Algerian rules transfer.

## Tax/invoicing

The implementation must not invent tax rates. Tax rules are configuration governed by approved business/legal requirements. Historical invoices/charges preserve the rule/snapshot used at the time.

## Consent and communications

Marketing communications, location permissions, analytics/cookies and optional messaging must have explicit consent/opt-in behavior where required.

## Change control

Legal requirements that materially affect architecture, retention, identity, payments or marketplace responsibilities require an ADR and documented product decision before implementation.
