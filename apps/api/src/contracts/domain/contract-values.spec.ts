import { buildContractValues, rentalDaysOf } from './contract-values';
import { ContractsErrorCode } from './contracts.rules';
import type { ContractValuesContext } from './contract-values';

function context(overrides: Partial<ContractValuesContext> = {}): ContractValuesContext {
  return {
    tenant: { name: 'Location Oran' },
    booking: {
      bookingNumber: 'BN-2026-0042',
      currency: 'DZD',
      startsAt: new Date('2026-09-03T08:00:00Z'),
      endsAt: new Date('2026-09-05T08:00:00Z'),
    },
    customer: {
      firstName: 'Amine',
      lastName: 'Benyoucef',
      preferredLocale: 'fr',
      licenseNumber: '11223344',
      licenseCountry: 'DZ',
    },
    vehicle: { make: 'Mercedes', model: 'C220', year: 2024, plateNumber: '12345-16-12' },
    pickupBranch: { name: 'Branche Oran Centre', contacts: { phone: '+213550000001' } },
    returnBranch: { name: 'Branche Aéroport', contacts: { phone: '+213550000002' } },
    verifiedLicense: { number: '99887766' },
    priceSnapshot: { currency: 'DZD', totalMinor: 45000, depositMinor: 10000 },
    ...overrides,
  };
}

describe('contract-values (08-C02 value assembly)', () => {
  it('assembles every template variable from the booking context', () => {
    const { values, totals, failures } = buildContractValues(context());
    expect(failures).toEqual([]);
    expect(totals).toEqual({ currency: 'DZD', totalMinor: 45000, depositMinor: 10000 });
    expect(values).toMatchObject({
      AGENCY_NAME: 'Location Oran',
      AGENCY_PHONE: '+213550000001',
      BOOKING_NUMBER: 'BN-2026-0042',
      CUSTOMER_FIRST_NAME: 'Amine',
      CUSTOMER_LAST_NAME: 'Benyoucef',
      // The VERIFIED document number is authoritative over the customer field.
      CUSTOMER_LICENSE_NUMBER: '99887766',
      CUSTOMER_LICENSE_COUNTRY: 'DZ',
      VEHICLE_MAKE: 'Mercedes',
      VEHICLE_MODEL: 'C220',
      VEHICLE_YEAR: 2024,
      VEHICLE_PLATE: '12345-16-12',
      PICKUP_BRANCH_NAME: 'Branche Oran Centre',
      RETURN_BRANCH_NAME: 'Branche Aéroport',
      CURRENCY: 'DZD',
      RENTAL_AMOUNT: 45000,
      DEPOSIT_AMOUNT: 10000,
    });
    expect(values.PICKUP_DATE).toEqual(new Date('2026-09-03T08:00:00Z'));
    expect(values.RENTAL_DAYS).toBe(2);
  });

  it('uses the pickup branch contact as the agency phone', () => {
    const { values } = buildContractValues(context({ pickupBranch: { name: 'X', contacts: { phone: ' 0550 00 00 01 ' } } }));
    expect(values.AGENCY_PHONE).toBe('0550 00 00 01');
  });

  it('falls back to the customer license fields when no verified document exists', () => {
    const { values, failures } = buildContractValues(context({ verifiedLicense: null }));
    expect(values.CUSTOMER_LICENSE_NUMBER).toBe('11223344');
    expect(failures).toEqual([]);
  });

  it('reports every missing context value with its error code', () => {
    const { values, totals, failures } = buildContractValues(
      context({
        tenant: { name: '  ' },
        customer: null,
        vehicle: null,
        pickupBranch: { name: null, contacts: null },
        returnBranch: null,
        verifiedLicense: null,
        priceSnapshot: null,
      }),
    );
    expect(totals).toBeNull();
    const byVariable = Object.fromEntries(failures.map((failure) => [failure.variable, failure.code]));
    expect(byVariable).toEqual({
      AGENCY_NAME: ContractsErrorCode.CONTRACT_AGENCY_NAME_MISSING,
      AGENCY_PHONE: ContractsErrorCode.CONTRACT_AGENCY_CONTACT_MISSING,
      CUSTOMER_FIRST_NAME: ContractsErrorCode.CONTRACT_CUSTOMER_MISSING,
      CUSTOMER_LAST_NAME: ContractsErrorCode.CONTRACT_CUSTOMER_MISSING,
      CUSTOMER_LICENSE_NUMBER: ContractsErrorCode.CONTRACT_LICENSE_MISSING,
      CUSTOMER_LICENSE_COUNTRY: ContractsErrorCode.CONTRACT_LICENSE_MISSING,
      VEHICLE_MAKE: ContractsErrorCode.CONTRACT_VEHICLE_MISSING,
      VEHICLE_MODEL: ContractsErrorCode.CONTRACT_VEHICLE_MISSING,
      VEHICLE_YEAR: ContractsErrorCode.CONTRACT_VEHICLE_MISSING,
      VEHICLE_PLATE: ContractsErrorCode.CONTRACT_VEHICLE_MISSING,
      PICKUP_BRANCH_NAME: ContractsErrorCode.CONTRACT_BRANCH_MISSING,
      RETURN_BRANCH_NAME: ContractsErrorCode.CONTRACT_BRANCH_MISSING,
      RENTAL_AMOUNT: ContractsErrorCode.CONTRACT_PRICING_MISSING,
      DEPOSIT_AMOUNT: ContractsErrorCode.CONTRACT_PRICING_MISSING,
    });
    expect(values.CURRENCY).toBe('DZD');
    expect(values.RENTAL_AMOUNT).toBeNull();
  });

  it('rounds partial days up to whole rental days', () => {
    expect(rentalDaysOf(new Date('2026-09-03T08:00:00Z'), new Date('2026-09-03T10:00:00Z'))).toBe(1);
    expect(rentalDaysOf(new Date('2026-09-03T08:00:00Z'), new Date('2026-09-05T09:00:00Z'))).toBe(3);
    expect(rentalDaysOf(new Date('2026-09-03T08:00:00Z'), new Date('2026-09-03T08:00:00Z'))).toBe(1);
  });

  it('is deterministic for identical inputs', () => {
    const first = buildContractValues(context());
    const second = buildContractValues(context());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
