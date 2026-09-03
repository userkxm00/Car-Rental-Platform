import { Permission, PermissionValue } from './permissions';

/**
 * Roles and their permission bundles (01-D02).
 *
 * Authority: docs/36-authentication-and-authorization-architecture.md —
 * "Roles are defaults/bundles. Fine-grained permissions are the actual
 * authorization capabilities." The bundle map is versioned code with tests.
 */
export const Role = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  AGENCY_OWNER_ADMIN: 'AGENCY_OWNER_ADMIN',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  STAFF_AGENT: 'STAFF_AGENT',
  FINANCE: 'FINANCE',
  CUSTOMER: 'CUSTOMER',
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];

/** Roles that can be held through an agency membership (02-B). */
export const MEMBERSHIP_ROLES: readonly RoleValue[] = [
  Role.AGENCY_OWNER_ADMIN,
  Role.BRANCH_MANAGER,
  Role.STAFF_AGENT,
  Role.FINANCE,
];

export const ROLE_PERMISSIONS: Record<RoleValue, readonly PermissionValue[]> = {
  [Role.PLATFORM_ADMIN]: [Permission.PLATFORM_ADMIN, Permission.REPORTS_READ],
  [Role.AGENCY_OWNER_ADMIN]: [
    Permission.PROFILE_MANAGE,
    Permission.VEHICLE_READ,
    Permission.VEHICLE_CREATE,
    Permission.VEHICLE_UPDATE,
    Permission.VEHICLE_ARCHIVE,
    Permission.BOOKING_READ,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_CONFIRM,
    Permission.BOOKING_CANCEL,
    Permission.BOOKING_EXTEND,
    Permission.BOOKING_RETURN,
    Permission.INSPECTION_CREATE,
    Permission.INSPECTION_APPROVE,
    Permission.PAYMENT_READ,
    Permission.PAYMENT_RECORD,
    Permission.PAYMENT_REFUND,
    Permission.PRICING_READ,
    Permission.PRICING_MANAGE,
    Permission.BILLING_MANAGE,
    Permission.CONTRACT_READ,
    Permission.CONTRACT_MANAGE,
    Permission.STAFF_MANAGE,
    Permission.REPORTS_READ,
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_MANAGE,
    Permission.CUSTOMER_LINK,
    Permission.CUSTOMER_DOCUMENT_VERIFY,
  ],
  [Role.BRANCH_MANAGER]: [
    Permission.PROFILE_MANAGE,
    Permission.VEHICLE_READ,
    Permission.VEHICLE_CREATE,
    Permission.VEHICLE_UPDATE,
    Permission.BOOKING_READ,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_CONFIRM,
    Permission.BOOKING_CANCEL,
    Permission.BOOKING_EXTEND,
    Permission.BOOKING_RETURN,
    Permission.INSPECTION_CREATE,
    Permission.INSPECTION_APPROVE,
    Permission.PAYMENT_READ,
    Permission.PAYMENT_RECORD,
    Permission.PRICING_READ,
    Permission.REPORTS_READ,
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_MANAGE,
    Permission.CUSTOMER_LINK,
    Permission.CUSTOMER_DOCUMENT_VERIFY,
    Permission.CONTRACT_READ,
    Permission.CONTRACT_MANAGE,
  ],
  [Role.STAFF_AGENT]: [
    Permission.PROFILE_MANAGE,
    Permission.VEHICLE_READ,
    Permission.BOOKING_READ,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_CONFIRM,
    Permission.BOOKING_CANCEL,
    Permission.BOOKING_EXTEND,
    Permission.BOOKING_RETURN,
    Permission.INSPECTION_CREATE,
    Permission.PAYMENT_READ,
    Permission.PRICING_READ,
    Permission.CUSTOMER_READ,
    Permission.CUSTOMER_MANAGE,
    Permission.CUSTOMER_DOCUMENT_VERIFY,
    Permission.CONTRACT_READ,
  ],
  [Role.FINANCE]: [
    Permission.PROFILE_MANAGE,
    Permission.PAYMENT_READ,
    Permission.PAYMENT_RECORD,
    Permission.PAYMENT_REFUND,
    Permission.PRICING_READ,
    Permission.BILLING_MANAGE,
    Permission.CONTRACT_READ,
    Permission.REPORTS_READ,
    Permission.CUSTOMER_READ,
  ],
  [Role.CUSTOMER]: [
    Permission.PROFILE_MANAGE,
    Permission.VEHICLE_READ,
    Permission.BOOKING_READ,
    Permission.BOOKING_CREATE,
    Permission.BOOKING_CANCEL,
    Permission.BOOKING_EXTEND,
    Permission.PAYMENT_READ,
  ],
};

export function permissionsForRole(role: RoleValue): readonly PermissionValue[] {
  return ROLE_PERMISSIONS[role];
}
