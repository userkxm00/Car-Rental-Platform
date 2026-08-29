# 09 — Owner & Staff Operations

## Owner operating model

The owner dashboard is exception-first and action-oriented.

### Attention Center

Prioritize:
- Overdue rentals.
- Returns due today.
- Pickups requiring preparation.
- Vehicles blocked or unavailable.
- Expiring insurance/inspection/registration documents.
- Maintenance due/overdue.
- Unpaid balances.
- Payment failures.
- Booking conflicts requiring resolution.
- Customer/support issues.
- Documents awaiting verification.

### Core owner areas

- Overview/dashboard.
- Reservations.
- Calendar/scheduler.
- Fleet.
- Customers.
- Contracts/documents.
- Payments/billing.
- Maintenance.
- Inspections/damage.
- Staff/tasks.
- Branches/locations/parking.
- Partners/referrals.
- Analytics.
- Settings.

## Vehicle workspace

Every vehicle should have one operational workspace with:
- Current status.
- Current/next rental.
- Calendar.
- Documents and expiry status.
- Mileage history.
- Fuel history.
- Pickup/return inspections.
- Damage history.
- Maintenance history.
- Expenses.
- Revenue.
- Utilization.
- Profitability metrics when data permits.

## Scheduler

Provide a timeline/calendar where reservations and operational blocks are visible. Inspired by BookCars' vehicle scheduler, but expanded with maintenance, inspection, damage, transfer and manual blocks.

Operations should support safe drag/drop only when the backend validates the resulting schedule.

## Staff task workflow

Staff should receive explicit tasks such as:
- Prepare vehicle.
- Pickup.
- Return.
- Inspection.
- Cleaning.
- Fuel check.
- Document verification.
- Vehicle transfer.
- Issue follow-up.

Task states:
- pending
- assigned
- in_progress
- blocked
- completed
- cancelled

Each task records actor and timestamps.

## Pickup workflow

1. Open task/scan booking QR.
2. Verify customer and booking.
3. Confirm vehicle assignment.
4. Verify required documents.
5. Record mileage/fuel.
6. Complete checklist.
7. Capture required photos.
8. Record pre-existing damage.
9. Complete contract/signature workflow when enabled.
10. Mark checkout complete.
11. Trigger relevant notifications.

## Return workflow

1. Open rental.
2. Verify vehicle/customer/booking.
3. Record final mileage/fuel.
4. Perform return checklist.
5. Capture photos.
6. Record new suspected damage.
7. Record extra charges if authorized.
8. Update financial settlement.
9. Move vehicle to readiness/maintenance/available state as appropriate.
10. Generate/send final documents.

## Vehicle readiness

A returned vehicle should not automatically become rentable. It may require:
- Cleaning.
- Inspection.
- Refueling.
- Maintenance.
- Damage review.

Readiness is a workflow with auditable completion.

## Operational metrics

Owner dashboard should expose actionable metrics such as:
- Utilization.
- Vehicles available now.
- Vehicles unavailable and why.
- Returns/pickups today.
- Revenue by branch.
- Revenue by vehicle/category.
- Outstanding balances.
- Maintenance spend.
- Vehicle profitability.
- Booking conversion where marketplace data exists.

## Reference inspiration

BookCars provides fleet management, vehicle scheduler, bookings and auto notifications.
Fleet-management-system adds useful ideas around inspection, post-check verification, rental conflict prevention, expiry dashboards and role-specific workflows.
Sources:
- https://github.com/aelassas/bookcars
- https://github.com/caliphviper/Fleet-management-system
- https://github.com/navodya0/FMS
