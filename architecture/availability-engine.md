# Availability Engine — Design Baseline

## Goal

Provide one authoritative answer to the question: **Can this inventory be rented for this exact interval and operational context?**

## Core principle

Availability is computed. It is not a trusted boolean stored on a vehicle.

A vehicle/category can be affected by time-bounded commitments including:

- confirmed reservations
- active rentals
- maintenance
- inspection/readiness holds
- damage/accident holds
- manual blackout
- transfer/repositioning
- other operational blocks

## Availability request

A request should conceptually include:

```text
inventory target
pickup location
return location
start date/time
end date/time
channel
optional vehicle preference
```

## Inventory models

The product must support both:

### Vehicle-specific booking

Customer/staff requests a particular vehicle.

### Category-based booking

Customer requests a category such as Economy/SUV and a specific vehicle is assigned later.

The selected model must be explicit per booking.

## Conflict rule

Two incompatible commitments for the same vehicle cannot overlap.

The implementation must treat interval boundaries consistently. Exact inclusivity/exclusivity is defined once and used everywhere.

## Buffer time

The engine must be able to support configurable operational buffers between rentals, such as:

- cleaning
- inspection
- transfer
- preparation

A buffer belongs to the operational availability calculation and must not be silently added only in the UI.

## Location constraints

Availability may depend on:

- pickup branch
- return branch
- delivery zone
- one-way return policy
- vehicle repositioning time
- location-specific vehicle eligibility

If a one-way rental requires repositioning time, the vehicle is unavailable during that required movement window.

## Search behavior

The customer search API should return inventory that is actually bookable under the requested context, not simply vehicles marked active.

Results should explain relevant constraints when no exact vehicle is available.

Useful fallback behavior may include:

1. exact vehicle match
2. same category
3. nearby branch/category
4. different pickup location

Fallbacks must be controlled by explicit product rules and never silently change the booking request.

## Scheduler

Owner/staff UI uses a timeline/calendar representation of commitments and blocks.

The scheduler should allow:
- day/week views
- resource filtering
- branch filtering
- status/commitment legend
- booking detail drill-down
- maintenance visibility
- drag/drop only when the resulting domain operation is validated server-side

## Atomicity

Availability validation and the write operation that consumes inventory must be designed as one protected business operation for concurrency-sensitive paths.

A successful availability read alone must never guarantee future reservation.

## Caching

Availability results may be cached for performance only when safe. Cached data must never be the final authority for confirming a booking.

## Future event-driven support

Availability-affecting events can emit domain events so calendars, notifications, analytics and projections update asynchronously.

## Definition of done

- no double booking under concurrent requests
- maintenance/blocks respected
- reassignment rechecked
- extension rechecked
- branch/one-way rules tested
- interval boundary rules documented
- unit/integration/E2E coverage for critical scenarios
