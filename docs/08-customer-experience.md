# 08 — Customer Experience

## Goal

Make renting a car feel fast, transparent and trustworthy from discovery to return.

## Customer journey

1. Discover
2. Search
3. Compare
4. Select
5. Review price/policy
6. Provide required information
7. Pay or choose payment method
8. Receive confirmation
9. Complete pre-arrival check-in when supported
10. Pickup via staff/QR workflow
11. Manage active rental via My Rental
12. Extend/report issue when needed
13. Return
14. Receive final receipt/settlement
15. Review/loyalty/referral actions

## Search and discovery

Search must support:
- Pickup and return location.
- Date and time.
- Vehicle category.
- Transmission.
- Fuel type.
- Seats.
- Price range.
- Features.
- Supplier/agency/branch where marketplace mode is enabled.
- Map/list results.

Results must clearly distinguish:
- Total/estimated price.
- Included mileage policy.
- Deposit.
- Required documents/eligibility.
- Pickup method.
- Cancellation policy.
- Extra fees before checkout.

## Vehicle detail page

Required:
- High-quality gallery grouped by section where possible (front, rear, sides, interior, trunk, dashboard).
- Make/model/year.
- Category.
- Transmission/fuel/seats.
- Features.
- Pricing breakdown.
- Availability for selected dates.
- Pickup/drop-off details and map.
- Deposit and payment information.
- Rental policies.
- Agency information.
- Clear booking CTA.

Regional reference: Autorockin organizes vehicle images by section and supports map/address workflows: https://github.com/abdelmoughit555/rental-car

## Checkout

Before final confirmation show a complete price breakdown:
- Base rental.
- Duration adjustments.
- Seasonal/date rate.
- Discounts.
- Extras.
- Pickup/drop-off fees.
- Taxes/charges where applicable.
- Deposit.
- Amount due now.
- Amount due later.

Never hide mandatory costs until after confirmation.

## Customer account

- Profile.
- Documents.
- Reservations.
- Active rentals.
- History.
- Invoices/receipts.
- Notifications.
- Support.
- Security/preferences.
- Loyalty/referrals when enabled.

## My Rental

During an active rental show:
- Vehicle.
- Contract.
- Pickup/return times.
- Remaining time.
- Mileage/fuel when available.
- Extension action.
- Return instructions.
- Report issue.
- Contact agency.
- Emergency/help information.

## Pre-arrival digital check-in

When enabled:
- Confirm customer details.
- Upload/verify required documents.
- Review rental terms.
- Complete allowed signatures/acknowledgements.
- Provide pickup instructions.

This must never bypass agency/legal verification requirements.

## QR workflow

Booking confirmation may include a QR code that lets authorized staff quickly retrieve the booking and start the permitted operational workflow.

The QR token must be opaque, revocable and authorization-checked server-side.

## Extension

Customer selects an extension duration; system re-checks availability, recalculates incremental cost and asks for confirmation/payment as required.

## Issue reporting

Customer can select an issue category, add description, photos and optional location. Each report creates a support/operational record linked to the active rental.

## Accessibility and localization

- Arabic RTL.
- French and English.
- Large tap targets on mobile.
- Clear error messages.
- Avoid text embedded in images.
- Dates, amounts and phone numbers formatted by locale.
