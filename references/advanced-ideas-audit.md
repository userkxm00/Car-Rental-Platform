# Reference Audit — Advanced Rental Ideas

## Source: Car Rental Booking Pro
https://github.com/EsLaM-Media/Car-Rental-Booking

Repository maturity is limited, so use this as an idea catalog rather than an architecture reference.

### Ideas worth studying

- Multi-vendor commissions.
- Traccar/GPS integration.
- Live fleet map.
- Ignition/speed alerts when telematics hardware supports them.
- Digital wallet/cashback.
- Split payment.
- Distance-based delivery fees.
- Visual damage blueprint.
- E-signature contracts.
- Risk/blacklist workflow.
- WhatsApp/Telegram/SMS/email notification adapters.

### Our adaptation

- GPS is optional and provider-neutral.
- Live location is permission/privacy controlled.
- Damage blueprint becomes a structured inspection component with evidence and human review.
- Risk flags never become automatic denial without an explicit policy and review workflow.
- Wallet/loyalty is deferred until the core payment ledger is reliable.
- Distance fees use the map/routing abstraction.

## Source: Ipark
https://github.com/abdelrany/Ipark

Although it is a parking application rather than rental software, it contains useful map UX concepts:

- Search location.
- Filters.
- Price and map pins.
- Directions.
- Spot/parking detail cards.
- Extend active time.
- Mobile-first location flow.
- User selectable spot concept.

### Our adaptation

For car rental:
- Show branch/parking/pickup points on the map.
- Show location-specific availability and fees.
- Offer directions.
- Allow pickup/drop-off location selection.
- Support extension of the active rental, not parking time.

## Source: Car Rental Agreement
https://github.com/fcoinnet/carrentalagreement

Useful ideas:
- Fully customizable contract templates.
- PDF export.
- Multilingual contract output.
- RTL support for Arabic.
- White-label business branding.

### Our adaptation

Contracts must be versioned and tied to booking snapshots so historical signed agreements remain reproducible.
