import {
  FleetErrorCode,
  isValidCategoryCode,
  isValidModelYear,
  isValidPlate,
  isValidVin,
} from './fleet-rules';
import { ALL_FEATURE_KEYS, FEATURE_CATALOG, FEATURE_LABELS, isFeatureKey } from './feature-catalog';

describe('Category code rules (03-A01)', () => {
  it.each(['ECO', 'SUV-4X4', 'A1'])('accepts %s', (code) => {
    expect(isValidCategoryCode(code)).toBe(true);
  });
  it.each(['a', 'x'.repeat(25), 'lower', 'has space'])('rejects %s', (code) => {
    expect(isValidCategoryCode(code)).toBe(false);
  });
});

describe('Vehicle identity rules (03-B02)', () => {
  it.each(['12345-31', 'ABC123', '1-2'])('accepts plate %s', (plate) => {
    expect(isValidPlate(plate)).toBe(true);
  });
  it.each(['', 'x'.repeat(20), 'bad plate!', 'a--b'])('rejects plate %s', (plate) => {
    expect(isValidPlate(plate)).toBe(false);
  });

  it('validates 17-character VINs', () => {
    expect(isValidVin('KMHCT4AE0DU123456')).toBe(true);
    expect(isValidVin('SHORT')).toBe(false);
    expect(isValidVin('KMHCT4AE0DU12345O')).toBe(false); // O not allowed in VINs
  });

  it('validates model years', () => {
    expect(isValidModelYear(2024)).toBe(true);
    expect(isValidModelYear(1979)).toBe(false);
    expect(isValidModelYear(new Date().getFullYear() + 2)).toBe(false);
    expect(isValidModelYear(2024.5)).toBe(false);
  });
});

describe('Feature catalog (03-A03)', () => {
  it('has unique keys and localized labels for every entry', () => {
    expect(new Set(ALL_FEATURE_KEYS).size).toBe(ALL_FEATURE_KEYS.length);
    for (const key of ALL_FEATURE_KEYS) {
      const labels = FEATURE_LABELS[key];
      expect(labels.ar).toBeTruthy();
      expect(labels.fr).toBeTruthy();
      expect(labels.en).toBeTruthy();
    }
  });

  it('recognizes only catalog keys', () => {
    expect(isFeatureKey(FEATURE_CATALOG.AIR_CONDITIONING)).toBe(true);
    expect(isFeatureKey('warp_drive')).toBe(false);
  });
});

describe('Fleet error codes', () => {
  it('exposes the documented codes', () => {
    expect(FleetErrorCode.CATEGORY_CODE_TAKEN).toBe('CATEGORY_CODE_TAKEN');
    expect(FleetErrorCode.VEHICLE_PLATE_TAKEN).toBe('VEHICLE_PLATE_TAKEN');
    expect(FleetErrorCode.INVALID_VEHICLE_STATUS_TRANSITION).toBe(
      'INVALID_VEHICLE_STATUS_TRANSITION',
    );
  });
});
