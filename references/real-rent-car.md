# Reference Audit — Real Rent Car

Repository: https://github.com/Mohamed-Galdi/real-rent-car
Priority: Secondary product/workflow reference

## Useful observed areas

- vehicle/customer/admin workflows
- real-time availability presentation
- online reservations
- client portal
- support tickets
- payment tracking
- analytics and reporting
- security/2FA concepts
- print/export workflows

## Lessons for our product

### Client portal
Treat the customer as an ongoing account, not a one-off checkout user. The customer should be able to manage profile, reservations, history, documents, support, and active rental context.

### Availability presentation
Availability must be understandable to the user, not only correct internally. Search results should clearly distinguish unavailable periods, pickup/drop-off constraints, and actual bookable options.

### Support
Support should be connected to a reservation/rental where relevant. A customer issue should preserve booking context, timestamps, attachments, and status.

### Reporting
Admin dashboards need operational and financial reports rather than only CRUD lists.

### Security
Privileged accounts benefit from stronger authentication controls such as 2FA. Exact mechanism will be chosen during security architecture.

## What we improve

- Stronger domain separation between quote, booking, rental, inspection, and payment.
- First-class tenant isolation.
- More explicit state machines.
- Immutable historical snapshots where required.
- Better staff mobile operational flows.
- Owner attention center and vehicle profitability.
