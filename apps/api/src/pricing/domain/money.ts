/**
 * PHASE-06 / 06-D01…D04: the exact-money library. Every authoritative
 * monetary value is an integer amount in the currency's minor units —
 * binary floating point never participates in calculation
 * (architecture/pricing-engine.md "Currency"). Formatting belongs to
 * presentation; this module only computes.
 */

import { roundMinorToPrecision } from './time-rules';

/** 06-D03: DZD is the R1 calculation/default currency. */
export const DEFAULT_CURRENCY = 'DZD';

/**
 * 06-D04: minor-unit precision per supported currency (the number of
 * minor units in one major unit). DZD/EUR/USD/MAD use 2 decimals;
 * TND uses 3.
 */
export const CURRENCY_MINOR_PRECISIONS: Record<string, number> = {
  DZD: 100,
  EUR: 100,
  USD: 100,
  MAD: 100,
  TND: 1000,
};

/** Hard cap for any single monetary amount (1e12 minor = 1e10 major DZD). */
export const MAX_MONEY_MINOR = 1_000_000_000_000;

/** Exact-money value: currency + integer minor amount. */
export interface Money {
  currency: string;
  amountMinor: number;
}

/** Minor-unit precision for a supported currency; throws on unknown ones. */
export function currencyMinorPrecision(currency: string): number {
  const precision = CURRENCY_MINOR_PRECISIONS[currency];
  if (precision === undefined) {
    throw new Error(`Unsupported currency for authoritative calculation: ${currency}`);
  }
  return precision;
}

/** Constructs a valid Money value (integer, bounded). */
export function moneyOf(currency: string, amountMinor: number): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error('Money amounts must be integer minor units.');
  }
  if (Math.abs(amountMinor) > MAX_MONEY_MINOR) {
    throw new Error(`Money amount out of bounds: ${amountMinor}`);
  }
  currencyMinorPrecision(currency);
  return { currency, amountMinor };
}

export function zeroMoney(currency: string): Money {
  return moneyOf(currency, 0);
}

/**
 * 06-D02: the single rounding entry point for monetary totals — halves
 * away from zero, to the currency's own minor precision.
 */
export function roundToCurrencyMinor(amountMinor: number, currency: string): number {
  return roundMinorToPrecision(amountMinor, currencyMinorPrecision(currency));
}

/** Adds same-currency money values (integer arithmetic only). */
export function addMoney(...values: Money[]): Money {
  if (values.length === 0) {
    return zeroMoney(DEFAULT_CURRENCY);
  }
  const currency = values[0].currency;
  for (const value of values) {
    if (value.currency !== currency) {
      throw new Error(
        `Cannot add different currencies in one calculation: ${currency} vs ${value.currency}`,
      );
    }
  }
  return moneyOf(currency, values.reduce((sum, value) => sum + value.amountMinor, 0));
}

/** True when the currency is supported for authoritative calculation. */
export function isSupportedCurrency(currency: string): boolean {
  return CURRENCY_MINOR_PRECISIONS[currency] !== undefined;
}
