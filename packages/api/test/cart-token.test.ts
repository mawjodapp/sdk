import { afterEach, describe, expect, it } from 'vitest'

import { cartPayload, createHarness, setCookieJar } from './helpers.js'

afterEach(() => {
  setCookieJar(null)
})

describe('guest cart token', () => {
  it('captures the token issued once at creation and sends it on later cart calls', async () => {
    setCookieJar('XSRF-TOKEN=tok')

    const token = 'a'.repeat(64)

    const { client, calls } = createHarness([
      { status: 201, body: { data: cartPayload({ guest_token: token }), meta: { request_id: 'r1' } } },
      // Every later response carries null; the stored token must survive it.
      { status: 200, body: { data: cartPayload({ guest_token: null }), meta: { request_id: 'r2' } } },
      { status: 200, body: { data: cartPayload({ guest_token: null }), meta: { request_id: 'r3' } } },
    ])

    await client.cart.addLine({ variant_id: 'variant-1', quantity: 1 })
    await client.cart.get()
    await client.cart.quote()

    // Nothing to send on the call that creates the cart.
    expect(calls[0]!.headers.get('X-Mawjod-Cart-Token')).toBeNull()
    expect(calls[1]!.headers.get('X-Mawjod-Cart-Token')).toBe(token)
    // If a null `guest_token` had overwritten storage, this third call would send nothing.
    expect(calls[2]!.headers.get('X-Mawjod-Cart-Token')).toBe(token)
  })

  it('forgets the token once the cart has been merged', async () => {
    setCookieJar('XSRF-TOKEN=tok')

    const token = 'b'.repeat(64)

    const { client, calls } = createHarness([
      { status: 201, body: { data: cartPayload({ guest_token: token }), meta: { request_id: 'r1' } } },
      { status: 200, body: { data: cartPayload({ is_guest: false }), meta: { request_id: 'r2' } } },
      { status: 201, body: { data: cartPayload({ is_guest: false }), meta: { request_id: 'r3' } } },
    ])

    await client.cart.addLine({ variant_id: 'variant-1', quantity: 1 })
    await client.cart.merge()

    // Merge is the one cart call that carries the token in the body rather than the header.
    expect(calls[1]!.body).toEqual({ guest_token: token })

    await client.cart.addLine({ variant_id: 'variant-2', quantity: 1 })

    // The guest cart is gone; replaying a dead token on the next add would be noise.
    expect(calls[2]!.headers.get('X-Mawjod-Cart-Token')).toBeNull()
  })
})
