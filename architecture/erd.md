# ERD / Domain Relationship Map

## Logical relationship overview

```text
users
  └── organization_memberships ──> organizations
                                      └── branches
                                           ├── parking_spots
                                           ├── locations
                                           └── vehicles
                                                ├── vehicle_documents
                                                ├── vehicle_blocks
                                                ├── maintenance_records
                                                ├── maintenance_schedules
                                                └── inspections

organizations
  ├── customers ──> customer_documents
  ├── vehicle_categories ──> vehicles
  ├── pricing_rules / promotions
  ├── bookings ──> booking_status_history
  │              ├── booking_pricing_snapshots
  │              ├── booking_items/extras
  │              ├── contracts
  │              ├── inspections ──> inspection_items/photos
  │              ├── damage_records
  │              ├── payments/deposits/refunds/adjustments
  │              └── invoices
  ├── service_zones
  ├── tasks ──> task_assignments
  ├── support_tickets ──> support_messages
  ├── partners / referrals / loyalty
  └── audit_events

platform control plane
  ├── plans ──> plan_entitlements
  ├── subscriptions ──> subscription_events
  ├── trials
  ├── license_keys ──> license_activations
  ├── entitlement_grants
  └── feature_flags
```

## Key cardinalities

- One user can have many organization memberships.
- One organization can have many branches, vehicles, customers, bookings and staff memberships.
- One branch belongs to one organization.
- One vehicle belongs to one organization and normally one current branch.
- One vehicle can have many documents, blocks, maintenance records and inspections.
- One customer belongs to one organization in the agency-specific customer domain; the global user identity may be nullable for manually created/guest customers.
- One booking belongs to one organization and one customer, plus one vehicle or vehicle category according to allocation workflow.
- One booking has many status-history entries.
- One confirmed booking has one authoritative pricing snapshot, with additional snapshots only when policy requires preserving a quote/reprice event.
- One booking can have many payments/adjustments/refunds and many documents/evidence objects.
- One pickup and one return inspection are associated with a rental lifecycle when required by policy.
- One inspection can have many photos and checklist observations.

## Ownership rule

Every tenant-owned record must have a direct `organization_id` or an unambiguous parent whose organization ownership is checked as part of authorization. Direct tenant columns are preferred for high-risk/high-frequency resources where they improve query safety and indexing.

## Deletion/archive rule

Business records with financial, contract, audit or legal history should use explicit lifecycle/archive states instead of destructive deletes. Referential cleanup must never silently erase historical truth.

## Sensitive data rule

Identity documents, signed contracts, inspection evidence and payment provider metadata require stricter access than ordinary profile information. Store only necessary metadata in the database and keep sensitive files in private object storage.

## Future expansion

The model intentionally supports:
- multiple branches
- multiple agencies
- category-level bookings with later vehicle assignment
- airport/hotel/custom delivery locations
- future customer mobile app
- future telematics/GPS integration
- future partner/marketplace capabilities
- regional/multi-currency expansion
