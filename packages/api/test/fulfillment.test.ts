import { afterEach, describe, expect, it } from 'vitest'

import type { DeliveryEstimate, FulfillmentQuote, Money, OrderFulfillment } from '../src/index.js'
import { createHarness, orderPayload, setCookieJar } from './helpers.js'

afterEach(() => setCookieJar(null))

const egp = (minor: number): Money => ({ minor, currency: 'EGP', tax_inclusive: true })
const promised: DeliveryEstimate = { minimum_minutes: 45, maximum_minutes: 90, unit: 'minute', minimum: 45, maximum: 90 }

function quotePayload(eta: DeliveryEstimate | null): FulfillmentQuote {
  return {
    method: 'delivery',
    zone_id: 'zone-1',
    pickup_location_id: null,
    rule_version: 1,
    subtotal: egp(25000),
    fee: egp(3000),
    minimum_order: egp(10000),
    free_threshold: null,
    free_threshold_applied: false,
    eta,
    allowed_payment_methods: ['cod'],
  }
}

describe('delivery eta', () => {
  it.each([promised, null])('a quote hands back eta as sent: an estimate or null (%o)', async (eta) => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client } = createHarness([
      { status: 200, body: { data: quotePayload(eta), meta: { request_id: 'req-quote' } } },
    ])

    const quote = await client.fulfillment.quotes({ method: 'delivery', subtotal_minor: 25000, address_id: 'a-1' })

    expect(quote.eta).toEqual(eta)
  })

  it.each([promised, null])('an order hands back fulfillment.eta as sent (%o)', async (eta) => {
    const fulfillment = { id: 'f-1', method: 'delivery', status: 'pending', eta }
    const { client } = createHarness([
      { status: 200, body: { data: orderPayload({ fulfillment }), meta: { request_id: 'req-order' } } },
    ])

    expect((await client.orders.get('order-1')).fulfillment?.eta).toEqual(eta)
  })

  it('makes an unguarded read a type error', () => {
    const read = (quote: FulfillmentQuote, fulfillment: OrderFulfillment) => [
      // @ts-expect-error a zone may promise no time, so `eta` can be null.
      quote.eta.minimum,
      // @ts-expect-error the order keeps the quote's null.
      fulfillment.eta.minimum,
      quote.eta?.minimum,
    ]

    expect(read).toBeTypeOf('function')
  })
})
