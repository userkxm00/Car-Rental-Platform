# 43 — Algeria & Maghreb Payment Strategy

## Product principle

The rental platform must work perfectly when payment is manual/offline and must not assume that every customer or agency will use online card payment.

## Customer → Agency payments — Release 1

Support the agency-defined payment workflow:
- pay at agency/counter
- cash status recording
- bank transfer/reference recording
- deposit recording
- partial payment
- payment due at pickup
- payment confirmation by staff

The booking engine must distinguish:
- booking confirmed
- payment pending
- payment partially settled
- payment settled

A booking can be operationally confirmed without online payment when the agency policy allows it.

## Agency → Platform payments

The SaaS operator should support:
- manual/offline payment recording
- bank transfer/reference
- direct contact with platform owner
- manually issued License Keys
- configurable renewal workflow

The public pricing page may display configured payment/contact instructions from Platform Admin settings.

## Online payments — future

The architecture should support provider adapters without making a provider mandatory.

Potential future providers include regional services such as Chargily Pay. Current Chargily Pay materials advertise CIB and EDAHABIA support, QR payments, and API integration for websites/applications.

Before enabling a live provider:
- confirm current merchant eligibility
- complete provider verification
- review fees/limits
- review settlement behavior
- implement verified webhooks
- implement reconciliation
- test refunds/failures/duplicates
- confirm applicable legal/commercial requirements

## Important payment architecture rule

Provider status is not the same as internal financial truth.

```text
Provider event
   ↓
Verification
   ↓
Idempotent reconciliation
   ↓
Internal payment transaction
   ↓
Booking/invoice balance projection
```

Never mark a payment successful solely because a client redirects back to the website.

## Currency

Primary release currency:
- DZD

Ready for:
- MAD
- TND
- EUR
- USD

Never use floating-point arithmetic for authoritative money calculations.

## Customer transparency

Before booking confirmation, show meaningful payment expectations:
- amount due now
- amount due at pickup
- deposit
- payment method
- cancellation/refund policy

Avoid ambiguous "pay later" text where the timing and amount are unclear.

## Agency configuration

Each agency can configure accepted methods, subject to platform capabilities:
- cash
- bank transfer
- online provider when enabled
- payment at counter
- other manually recorded methods

## Reference

Chargily Pay currently describes CIB, EDAHABIA and QR payment options and API integration. Use this as a future integration reference, not as a hard dependency.
