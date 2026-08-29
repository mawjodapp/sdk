import { describe, expect, it } from 'vitest'

import { formatMoney } from '../src/money.js'

describe('formatMoney', () => {
  it('takes the minor-unit divisor from the currency rather than assuming hundredths', () => {
    const egp = formatMoney({ minor: 129900, currency: 'EGP', tax_inclusive: true }, 'en-US')
    // 129900 piastres is 1,299.00 EGP.
    expect(egp).toContain('1,299.00')
    expect(egp).not.toContain('129,900')

    // Yen has no minor unit, so the same integer must not be divided at all. A hardcoded /100
    // would render 1,299 here and fail.
    const jpy = formatMoney({ minor: 129900, currency: 'JPY', tax_inclusive: true }, 'en-US')
    expect(jpy).toContain('129,900')
    expect(jpy).not.toContain('1,299.00')
  })
})
