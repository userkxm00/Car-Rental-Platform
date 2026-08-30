import {
  isValidBranchCode,
  isValidContacts,
  isValidDayOfWeek,
  isOpenBeforeClose,
  isValidTime,
} from './branch-rules';

describe('Branch code rules (02-C03)', () => {
  it.each(['ORN-01', 'ALG', 'A1-B2'])('accepts %s', (code) => {
    expect(isValidBranchCode(code)).toBe(true);
  });
  it.each(['a', 'x'.repeat(21), 'lower', 'has space', '-A1', 'A1-'])('rejects %s', (code) => {
    expect(isValidBranchCode(code)).toBe(false);
  });
});

describe('Operating hour rules (02-C04/05)', () => {
  it.each(['00:00', '08:30', '23:59'])('accepts time %s', (time) => {
    expect(isValidTime(time)).toBe(true);
  });
  it.each(['24:00', '8:30', '0830', '12:60', 'noon'])('rejects time %s', (time) => {
    expect(isValidTime(time)).toBe(false);
  });
  it('validates ISO day numbering 0-6', () => {
    expect(isValidDayOfWeek(0)).toBe(true);
    expect(isValidDayOfWeek(6)).toBe(true);
    expect(isValidDayOfWeek(-1)).toBe(false);
    expect(isValidDayOfWeek(7)).toBe(false);
    expect(isValidDayOfWeek(1.5)).toBe(false);
  });
  it('requires open before close', () => {
    expect(isOpenBeforeClose('08:00', '18:00')).toBe(true);
    expect(isOpenBeforeClose('18:00', '08:00')).toBe(false);
  });
});

describe('Branch contacts rules (02-C06)', () => {
  it('accepts the documented contact keys', () => {
    expect(isValidContacts({ phone: '+213...', email: 'a@b.co' })).toBe(true);
    expect(isValidContacts(null)).toBe(true);
    expect(isValidContacts(undefined)).toBe(true);
  });
  it('rejects unknown keys', () => {
    expect(isValidContacts({ phone: 'x', owner: 'someone' })).toBe(false);
    expect(isValidContacts('phone')).toBe(false);
    expect(isValidContacts(['phone'])).toBe(false);
  });
});
