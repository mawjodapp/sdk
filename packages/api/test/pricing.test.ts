import { afterEach, describe, expect, it } from 'vitest'

import type { ProductDisplayPrice } from '../src/index.js'
import { createHarness, setCookieJar } from './helpers.js'

afterEach(() => setCookieJar(null))

const onSale: ProductDisplayPrice = {
  product_id: 'p-1',
  variants: [
    {
      variant_id: 'v-1',
      base_minor: 29_000,
      effective_minor: 24_650,
      discount: { name_ar: 'خصم الافتتاح', name_en: 'Opening sale', type: 'percentage', value: 1500 },
    },
    { variant_id: 'v-2', base_minor: 26_000, effective_minor: 26_000, discount: null },
  ],
}

describe('display prices', () => {
  it('asks once for the whole screen and hands rows back as sent', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client, calls } = createHarness([{ body: { data: [onSale], meta: { request_id: 'r' } } }])

    const prices = await client.pricing.productPrices({ product_ids: ['p-1', 'p-gone'] })

    expect(prices).toEqual([onSale])
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      ['/api/v1/pricing/product-prices', { product_ids: ['p-1', 'p-gone'] }],
    ])
  })

  it('answers an empty screen with an empty list, not an error', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client } = createHarness([{ body: { data: [], meta: { request_id: 'r' } } }])

    expect(await client.pricing.productPrices({ product_ids: ['p-unknown'] })).toEqual([])
  })
})
