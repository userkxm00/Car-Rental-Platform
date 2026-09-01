/**
 * Permission catalog (01-D01) — the stable, versioned fine-grained
 * authorization capabilities of the platform.
 *
 * Authority: docs/36-authentication-and-authorization-architecture.md
 * ("Permission examples") + architecture/authentication-authorization.md.
 * The catalog is versioned: renaming or removing an entry requires a
 * deprecation window because persistence (02-B memberships) and clients
 * reference permission keys.
 */
export const Permission = {
  // Identity (user-scoped)
  PROFILE_MANAGE: 'profile.manage',

  // Fleet
  VEHICLE_READ: 'vehicle.read',
  VEHICLE_CREATE: 'vehicle.create',
  VEHICLE_UPDATE: 'vehicle.update',
  VEHICLE_ARCHIVE: 'vehicle.archive',

  // Bookings
  BOOKING_READ: 'booking.read',
  BOOKING_CREATE: 'booking.create',
  BOOKING_CONFIRM: 'booking.confirm',
  BOOKING_CANCEL: 'booking.cancel',
  BOOKING_EXTEND: 'booking.extend',
  BOOKING_RETURN: 'booking.return',

  // Customers (07-A)
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_MANAGE: 'customer.manage',
  CUSTOMER_LINK: 'customer.link',
  CUSTOMER_DOCUMENT_VERIFY: 'customer.document.verify',

  // Inspections
  INSPECTION_CREATE: 'inspection.create',
  INSPECTION_APPROVE: 'inspection.approve',

  // Payments / finance
  PAYMENT_READ: 'payment.read',
  PAYMENT_RECORD: 'payment.record',
  PAYMENT_REFUND: 'payment.refund',
  PRICING_READ: 'pricing.read',
  PRICING_MANAGE: 'pricing.manage',
  BILLING_MANAGE: 'billing.manage',

  // Agency administration
  STAFF_MANAGE: 'staff.manage',
  REPORTS_READ: 'reports.read',

  // Platform boundary (audited — see authorization.service.ts)
  PLATFORM_ADMIN: 'platform.admin',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly PermissionValue[] = Object.values(Permission);

/** Human-readable purpose of each permission (documentation/audit). */
export const PERMISSION_DOC: Record<PermissionValue, string> = {
  [Permission.PROFILE_MANAGE]: 'Manage the authenticated user’s own profile.',
  [Permission.VEHICLE_READ]: 'Read fleet vehicles.',
  [Permission.VEHICLE_CREATE]: 'Create fleet vehicles.',
  [Permission.VEHICLE_UPDATE]: 'Update fleet vehicles.',
  [Permission.VEHICLE_ARCHIVE]: 'Archive fleet vehicles.',
  [Permission.BOOKING_READ]: 'Read bookings.',
  [Permission.BOOKING_CREATE]: 'Create bookings.',
  [Permission.BOOKING_CONFIRM]: 'Confirm bookings.',
  [Permission.BOOKING_CANCEL]: 'Cancel bookings.',
  [Permission.BOOKING_EXTEND]: 'Extend bookings.',
  [Permission.BOOKING_RETURN]: 'Return bookings.',
  [Permission.CUSTOMER_READ]: 'Read agency customer records.',
  [Permission.CUSTOMER_MANAGE]: 'Create and update agency customer records.',
  [Permission.CUSTOMER_LINK]: 'Link/unlink a platform account to a customer record.',
  [Permission.CUSTOMER_DOCUMENT_VERIFY]: 'Verify customer identity documents.',
  [Permission.INSPECTION_CREATE]: 'Record inspections.',
  [Permission.INSPECTION_APPROVE]: 'Approve inspections.',
  [Permission.PAYMENT_READ]: 'Read payments.',
  [Permission.PAYMENT_RECORD]: 'Record payments.',
  [Permission.PAYMENT_REFUND]: 'Refund payments.',
  [Permission.PRICING_READ]: 'Read pricing.',
  [Permission.PRICING_MANAGE]: 'Manage pricing.',
  [Permission.BILLING_MANAGE]: 'Manage billing.',
  [Permission.STAFF_MANAGE]: 'Manage agency staff.',
  [Permission.REPORTS_READ]: 'Read reports.',
  [Permission.PLATFORM_ADMIN]: 'Platform-boundary administration (audited).',
};
