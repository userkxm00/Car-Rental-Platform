# 07 — Map & Location Experience

The map is a first-class product capability, not decorative UI. The experience is inspired by BookCars' hierarchical locations, parking spots and map search, then extended for North African rental operations.

## Customer map experience

### Search modes

Customer can search by:
- City.
- Wilaya/province.
- Airport.
- Hotel/accommodation.
- Branch.
- Named pickup point.
- Current location, when permission is granted.

### Map/list UX

Desktop/tablet:
- Split map/list view.
- Moving the map can refresh nearby results.
- Filters remain accessible without losing map context.

Mobile:
- Toggle Map / List.
- Bottom-sheet vehicle cards.
- Clustered pins at high density.
- "Search this area" action after map movement.

### Pins

Pins may represent:
- Agency branch.
- Parking location.
- Pickup location.
- Delivery/service zone.
- Search result vehicle location only when explicitly enabled by business/privacy policy.

The default customer experience should show pickup locations, not exact live positions of individual rentable cars unless the agency intentionally exposes that information.

### Location details

A branch/location card may show:
- Name.
- Address.
- Distance.
- Opening hours.
- Pickup method.
- Contact options.
- Available categories/cars.
- Delivery/pickup fee.
- Facilities.
- Photos.
- Directions.

## Pickup/drop-off model

Support:
- Same location return.
- Different location return.
- Airport pickup/return.
- Hotel delivery/pickup.
- Branch pickup/return.
- Custom meeting point, subject to agency policy.

The pricing engine may attach a location/delivery fee, and availability must account for vehicle repositioning time where needed.

## Hierarchical location model

Conceptual hierarchy:

Country → Region/Wilaya → City → Area → Branch/Parking/Pickup Point

The data model must allow a location to be searchable without requiring every level to exist.

## Agency map management

Owner/Admin can:
- Create/edit branch coordinates.
- Manage parking/staging points.
- Define pickup/drop-off availability by location.
- Define delivery zones.
- Add location-specific fees/rules.
- Add opening hours and holiday exceptions.
- Add localized names/addresses.

## Map provider abstraction

Do not hard-code the domain model to one map provider.

Provider adapter should allow future support for providers such as Google Maps, Mapbox or OpenStreetMap-based services.

Separate:
- Geocoding.
- Address autocomplete.
- Map rendering.
- Routing/directions.
- Distance calculation.

Only enable provider capabilities that are actually configured.

## Privacy and safety

- Never expose precise customer location without consent and product justification.
- Never expose a vehicle's exact live location publicly by default.
- Staff/owner location data must be permission-scoped.
- Audit sensitive location access where appropriate.

## Reference

BookCars explicitly supports hierarchical locations, parking spots, maps and location-based search: https://github.com/aelassas/bookcars

A Moroccan car-rental reference (Autorockin) also uses map search and address autocomplete, supporting the relevance of this capability for the regional market: https://github.com/abdelmoughit555/rental-car
