# Domain Model

## Purpose
Define the business vocabulary before database implementation.

## Core aggregate areas

### Platform
- PlatformUser
- Agency/Tenant
- Subscription
- Plan
- Entitlement
- LicenseKey
- FeatureFlag
- PlatformAuditEvent

### Organization
- Agency
- Branch
- StaffMembership
- Role
- Permission
- Location
- ParkingArea
- PickupPoint
- DeliveryZone

### Fleet
- VehicleCategory
- Vehicle
- VehicleDocument
- VehicleImage
- VehicleOperationalBlock
- MileageRecord
- FuelRecord
- VehicleExpense

### Rental
- Customer
- Quote
- Booking
- BookingItem
- BookingPriceSnapshot
- BookingStatusHistory
- Cancellation
- ExtensionRequest
- Pickup
- Return

### Inspection
- Inspection
- InspectionItem
- InspectionPhoto
- DamageRecord
- DamageResolution

### Maintenance
- MaintenancePlan
- MaintenanceRecord
- MaintenanceTask
- ReadinessRecord

### Money
- Payment
- PaymentAllocation
- Deposit
- Refund
- Invoice
- InvoiceLine
- FinancialAdjustment

### Communication
- Notification
- NotificationDelivery
- SupportTicket
- SupportMessage

### Growth
- Partner
- Referral
- LoyaltyAccount
- Promotion

### Files
- FileObject
- DocumentRequirement
- DocumentSubmission

## Aggregate rules

- Agency is the tenant boundary for operational SaaS data.
- A vehicle belongs to one agency and may move between branches through explicit operational events.
- Booking references a customer, agency and vehicle/category according to booking mode.
- Pricing snapshots preserve the financial facts used at confirmation.
- Inspection belongs to a rental event and records immutable evidence plus actor/timestamps.
- Payments are append-oriented transactions; corrections use adjustments/refunds rather than destructive edits.
- Audit records are append-only.

## Important relationship distinctions

### Vehicle vs Vehicle Category
Category describes bookable characteristics and default pricing. Vehicle is the physical inventory unit.

### Quote vs Booking
Quote is a calculated offer that may expire. Booking is a committed rental record with lifecycle and historical snapshots.

### Customer vs Agency Customer Relation
A customer identity may exist independently from an agency relationship. Tenant access must still be enforced for agency-scoped data.

### Location vs Branch
A branch is an operational organization location. A pickup point may be an airport, hotel, custom point or other location and may not be a branch.

### Operational block vs booking
A block prevents vehicle availability for an operational reason and is not a customer reservation.

## Future customer-app compatibility

Customer accounts, bookings, documents, payments and notifications are modeled through the same domain so a future customer mobile application does not require a second data model.
