import { afterEach, describe, expect, it } from 'vitest'

import { MawjodNetworkError } from '../src/errors.js'
import { cartPayload, createHarness, setCookieJar } from './helpers.js'

afterEach(() => {
  setCookieJar(null)
})

describe('CSRF handling', () => {
  it('bootstraps the cookie before the first write and echoes the decoded token', async () => {
    setCookieJar(null)

    const { client, calls } = createHarness([
      // GET /sanctum/csrf-cookie. Laravel stores the token URL-encoded.
      { status: 204, setCookie: 'XSRF-TOKEN=tok%3D%3D; mawjod-session=abc' },
      { status: 201, body: { data: cartPayload(), meta: { request_id: 'req-1' } } },
    ])

    await client.cart.addLine({ variant_id: 'variant-1', quantity: 1 })

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /api/v1/cart/lines',
    ])
    // Sanctum answers 419 unless the header carries the *decoded* cookie value.
    expect(calls[1]!.headers.get('X-XSRF-TOKEN')).toBe('tok==')
  })

  it('does not bootstrap for a read', async () => {
    setCookieJar(null)

    const { client, calls } = createHarness([
      { status: 200, body: { data: cartPayload(), meta: { request_id: 'req-1' } } },
    ])

    await client.cart.get()

    expect(calls.map((call) => call.path)).toEqual(['/api/v1/cart'])
  })

  it('refreshes the token once and replays the write when the server answers 419', async () => {
    setCookieJar('XSRF-TOKEN=stale')

    const { client, calls } = createHarness([
      // The stale token is rejected.
      { status: 419, body: { message: 'CSRF token mismatch.' } },
      // Refresh issues a new one.
      { status: 204, setCookie: 'XSRF-TOKEN=fresh' },
      { status: 201, body: { data: cartPayload({ item_count: 2 }), meta: { request_id: 'req-2' } } },
    ])

    const cart = await client.cart.addLine({ variant_id: 'variant-1', quantity: 1 })

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /api/v1/cart/lines',
      'GET /sanctum/csrf-cookie',
      'POST /api/v1/cart/lines',
    ])
    expect(calls[0]!.headers.get('X-XSRF-TOKEN')).toBe('stale')
    expect(calls[2]!.headers.get('X-XSRF-TOKEN')).toBe('fresh')
    expect(cart.item_count).toBe(2)
  })

  it('fails the write as a transport error when the CSRF endpoint does not answer 204', async () => {
    setCookieJar(null)

    const { client, calls } = createHarness([{ status: 500, raw: '<html>gateway</html>', contentType: 'text/html' }])

    await expect(client.cart.addLine({ variant_id: 'variant-1', quantity: 1 })).rejects.toBeInstanceOf(
      MawjodNetworkError,
    )

    // The write must never be attempted: retry the CSRF call, not the mutation.
    expect(calls.map((call) => call.path)).toEqual(['/sanctum/csrf-cookie'])
  })
})
