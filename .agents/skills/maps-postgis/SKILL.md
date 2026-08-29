---
name: maps-postgis
description: Design and implement map, geospatial, location, branch, pickup, return, parking, delivery-zone, proximity-search, and geocoding features for the Car Rental Platform. Use when working with PostGIS, map/list search, coordinates, polygons, distance calculations, address autocomplete, or location providers.
---

# Maps & PostGIS Skill

## Domain model

Treat location as a business domain, not just latitude/longitude. Distinguish branch, office, parking, pickup point, return point, airport/hotel point, delivery zone, and internal operational location.

## PostGIS

Use PostGIS for authoritative spatial queries such as:
- nearby branches/offers;
- radius/proximity filtering;
- delivery-zone containment;
- distance fees;
- spatial ordering;
- future route/repositioning calculations.

Keep map tiles, geocoding, directions and autocomplete behind provider adapters. Do not leak provider-specific objects into core domain logic.

## Marketplace search

Search must combine geographic context with real availability and pricing. A nearby car that cannot actually be booked must not appear as available merely because its point is close.

## Privacy

Do not expose exact live customer or vehicle coordinates publicly by default. Generalize/round sensitive locations where the product does not require precision.

## UI

Maintain Map/List parity. Every map result must have an accessible list/card representation. Support Arabic RTL and French/English labels without embedding text in map images.

## External references

Patterns were informed by BookCars, Autorockin and Ipark audits in `references/`. Those projects are research references only.
