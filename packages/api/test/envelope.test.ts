import { describe, expect, it } from 'vitest'

import { PayloadIntegrityError } from '../src/errors.js'
import { createHarness, orderPayload } from './helpers.js'

describe('envelope parsing', () => {
  it('parses pagination links and meta, keeping filtered total distinct from page size', async () => {
    const { client } = createHarness([
      {
        status: 200,
        body: {
          data: [orderPayload()],
          links: {
            first: 'https://shop.test/api/v1/customer/orders?page=1',
            last: 'https://shop.test/api/v1/customer/orders?page=3',
            prev: null,
            next: 'https://shop.test/api/v1/customer/orders?page=2',
          },
          meta: {
            request_id: 'req-list',
            current_page: 1,
            per_page: 20,
            last_page: 3,
            total: 47,
          },
        },
      },
    ])

    const page = await client.orders.list({ page: { size: 20 } })

    expect(page.data).toHaveLength(1)
    expect(page.meta.current_page).toBe(1)
    expect(page.meta.last_page).toBe(3)
    // `total` is the filtered count across all pages, not the number of rows in this one.
    expect(page.meta.total).toBe(47)
    expect(page.meta.request_id).toBe('req-list')
    expect(page.links.next).toBe('https://shop.test/api/v1/customer/orders?page=2')
    expect(page.links.prev).toBeNull()
  })
})

describe('payload integrity guard', () => {
  it('refuses an order that came back with no lines, carrying the request id', async () => {
    const { client } = createHarness([
      {
        status: 200,
        body: { data: orderPayload({ lines: [] }), meta: { request_id: 'req-hollow' } },
      },
    ])

    const error = await client.orders.get('order-1').catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(PayloadIntegrityError)
    expect((error as PayloadIntegrityError).resource).toBe('order')
    expect((error as PayloadIntegrityError).resourceId).toBe('order-1')
    // Without the request id there is no way to find the failing response in the server logs.
    expect((error as PayloadIntegrityError).requestId).toBe('req-hollow')
  })

  it('refuses a list whose rows are hollow, not only a detail read', async () => {
    const { client } = createHarness([
      {
        status: 200,
        body: {
          data: [orderPayload(), orderPayload({ id: 'order-2', lines: [] })],
          links: { first: null, last: null, prev: null, next: null },
          meta: { request_id: 'req-list-hollow', current_page: 1, per_page: 20, last_page: 1, total: 2 },
        },
      },
    ])

    const error = await client.orders.list().catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(PayloadIntegrityError)
    // The healthy first row must not mask the broken second one.
    expect((error as PayloadIntegrityError).resourceId).toBe('order-2')
  })
})
