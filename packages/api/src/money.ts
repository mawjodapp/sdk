import type { Money } from './types.js'

/**
 * Formats minor units for display.
 *
 * The divisor comes from the currency itself, not a hardcoded 100: EGP has two minor digits, JPY
 * has none, KWD has three. Getting that wrong is a factor-of-1000 pricing bug.
 *
 * `options` styles the output only; it never changes how minor units are converted.
 */
export function formatMoney(money: Money, locale?: string, options?: Intl.NumberFormatOptions): string {
  const digits = minorUnitDigits(money.currency, locale)

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    ...options,
  }).format(money.minor / 10 ** digits)
}

function minorUnitDigits(currency: string, locale?: string): number {
  const resolved = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()

  return resolved.maximumFractionDigits ?? 2
}
