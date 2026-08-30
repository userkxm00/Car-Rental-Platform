import { PERMISSION_DOC, Permission } from './permissions';
import { MEMBERSHIP_ROLES, permissionsForRole, Role, ROLE_PERMISSIONS } from './roles';

describe('Role/permission catalog (01-D01/01-D02)', () => {
  it('documents every catalog permission', () => {
    const catalog = Object.values(Permission);
    expect(new Set(catalog).size).toBe(catalog.length);
    for (const permission of catalog) {
      expect(PERMISSION_DOC[permission]).toBeTruthy();
    }
  });

  it('covers the permission examples from docs/36', () => {
    const documented = [
      'vehicle.read',
      'vehicle.create',
      'vehicle.update',
      'vehicle.archive',
      'booking.read',
      'booking.create',
      'booking.confirm',
      'booking.cancel',
      'booking.extend',
      'booking.return',
      'inspection.create',
      'inspection.approve',
      'payment.read',
      'payment.record',
      'payment.refund',
      'pricing.read',
      'pricing.manage',
      'staff.manage',
      'reports.read',
      'billing.manage',
    ];
    for (const key of documented) {
      expect(Object.values(Permission)).toContain(key);
    }
  });

  it('platform admin is the only holder of the platform boundary permission', () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      if (role === Role.PLATFORM_ADMIN) {
        expect(permissions).toContain(Permission.PLATFORM_ADMIN);
      } else {
        expect(permissions).not.toContain(Permission.PLATFORM_ADMIN);
      }
    }
  });

  it('only membership roles may be assigned through agency membership (01-D03)', () => {
    expect(MEMBERSHIP_ROLES).not.toContain(Role.PLATFORM_ADMIN);
    expect(MEMBERSHIP_ROLES).not.toContain(Role.CUSTOMER);
    expect(MEMBERSHIP_ROLES).toEqual([
      Role.AGENCY_OWNER_ADMIN,
      Role.BRANCH_MANAGER,
      Role.STAFF_AGENT,
      Role.FINANCE,
    ]);
  });

  it('customer bundle grants only self-service and marketplace capabilities', () => {
    const customer = permissionsForRole(Role.CUSTOMER);
    expect(customer).toContain(Permission.PROFILE_MANAGE);
    expect(customer).toContain(Permission.VEHICLE_READ);
    expect(customer).toContain(Permission.BOOKING_CREATE);
    expect(customer).not.toContain(Permission.STAFF_MANAGE);
    expect(customer).not.toContain(Permission.PRICING_MANAGE);
    expect(customer).not.toContain(Permission.PAYMENT_REFUND);
    expect(customer).not.toContain(Permission.INSPECTION_APPROVE);
  });

  it('agency owner bundle includes agency administration capabilities', () => {
    const owner = permissionsForRole(Role.AGENCY_OWNER_ADMIN);
    expect(owner).toContain(Permission.STAFF_MANAGE);
    expect(owner).toContain(Permission.PRICING_MANAGE);
    expect(owner).toContain(Permission.BILLING_MANAGE);
    expect(owner).toContain(Permission.VEHICLE_ARCHIVE);
    expect(owner).not.toContain(Permission.PLATFORM_ADMIN);
  });

  it('finance bundle is limited to finance capabilities', () => {
    const finance = permissionsForRole(Role.FINANCE);
    expect(finance).toContain(Permission.PAYMENT_REFUND);
    expect(finance).toContain(Permission.BILLING_MANAGE);
    expect(finance).not.toContain(Permission.STAFF_MANAGE);
    expect(finance).not.toContain(Permission.VEHICLE_CREATE);
  });
});
