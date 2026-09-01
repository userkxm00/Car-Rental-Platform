import {
  addMoney,
  CURRENCY_MINOR_PRECISIONS,
  currencyMinorPrecision,
  DEFAULT_CURRENCY,
  isSupportedCurrency,
  MAX_MONEY_MINOR,
  moneyOf,
  roundToCurrencyMinor,
  zeroMoney,
} from './money';

/**
 * 06-D01…D04: the exact-money library — integer minor units only, the
 * centralized currency-precision rounding entry point, DZD defaults and
 * the multi-currency precision table.
 */

describe('exact money (06-D01…D04)', () => {
  it('carries the supported-currency precision table (TND has 3 decimals)', () => {
    expect(CURRENCY_MINOR_PRECISIONS).toMatchObject({
      DZD: 100,
      EUR: 100,
      USD: 100,
      MAD: 100,
      TND: 1000,
    });
    expect(DEFAULT_CURRENCY).toBe('DZD');
    expect(isSupportedCurrency('DZD')).toBe(true);
    expect(isSupportedCurrency('TND')).toBe(true);
    expect(isSupportedCurrency('BTC')).toBe(false);
  });

  it('constructs money only from bounded integer minor units', () => {
    expect(moneyOf('DZD', 1234)).toEqual({ currency: 'DZD', amountMinor: 1234 });
    expect(() => moneyOf('DZD', 12.5)).toThrow(/integer minor units/);
    expect(() => moneyOf('DZD', MAX_MONEY_MINOR + 1)).toThrow(/out of bounds/);
    expect(() => moneyOf('BTC', 1)).toThrow(/Unsupported currency/);
    expect(() => currencyMinorPrecision('BTC')).toThrow(/Unsupported currency/);
    expect(zeroMoney('EUR')).toEqual({ currency: 'EUR', amountMinor: 0 });
  });

  it('rounds totals to the currency precision (halves away from zero)', () => {
    expect(roundToCurrencyMinor(23_516, 'DZD')).toBe(23_500);
    expect(roundToCurrencyMinor(23_550, 'DZD')).toBe(23_600);
    expect(roundToCurrencyMinor(3_996, 'TND')).toBe(4_000);
    expect(roundToCurrencyMinor(1_499, 'TND')).toBe(1_000);
    expect(roundToCurrencyMinor(-235, 'DZD')).toBe(-200);
  });

  it('adds same-currency values with integer arithmetic only', () => {
    expect(
      addMoney(moneyOf('DZD', 100), moneyOf('DZD', 250), moneyOf('DZD', -50)),
    ).toEqual({ currency: 'DZD', amountMinor: 300 });
    expect(() => addMoney(moneyOf('DZD', 1), moneyOf('EUR', 1))).toThrow(
      /Cannot add different currencies/,
    );
    expect(addMoney()).toEqual({ currency: 'DZD', amountMinor: 0 });
  });
});
