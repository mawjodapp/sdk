import { afterEach, describe, expect, it } from 'vitest'

import { type GuestOrder, isCheckoutError, memoryCartTokenStorage, type Order } from '../src/index.js'
import { createHarness, orderPayload, problem, setCookieJar } from './helpers.js'

afterEach(() => setCookieJar(null))

const TOKEN = 'a'.repeat(64)
const customer = { email: 'nour@example.test', phone: '+201000000001' }

describe('guest checkout', () => {
  it('buys the stored token, keys the header, and forgets the token the server released', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const storage = memoryCartTokenStorage(TOKEN)
    const { client, calls } = createHarness(
      [{ status: 201, body: { data: orderPayload({ customer: null, address: null }), meta: { request_id: 'r' } } }],
      { cartTokenStorage: storage },
    )

    const result = await client.guest.checkout({
      customer,
      fulfillment_method: 'pickup',
      payment_method: 'cod',
      pickup_location_id: 'loc-1',
    })

    expect(calls[0]!.path).toBe('/api/v1/guest/checkout')
    expect(calls[0]!.headers.get('Idempotency-Key')).toBe(result.idempotencyKey)
    expect(calls[0]!.body).toMatchObject({ guest_token: TOKEN, operation_id: result.operationId, customer })
    expect(calls[0]!.body).not.toHaveProperty('idempotency_key')
    expect(result.order.customer).toBeNull()
    expect(await storage.get()).toBeNull()
  })

  it('refuses to send without a token, and keeps the token when the server refuses', async () => {
    const { client: empty, calls: none } = createHarness([])
    const input = { customer, fulfillment_method: 'pickup' as const, payment_method: 'cod' as const }

    await expect(empty.guest.checkout(input)).rejects.toThrow(/needs a guest cart token/)
    expect(none).toHaveLength(0)

    setCookieJar('XSRF-TOKEN=tok')
    const storage = memoryCartTokenStorage(TOKEN)
    const { client } = createHarness(
      [{ status: 403, contentType: 'application/problem+json', body: problem(403, 'guest_checkout_disabled') }],
      { cartTokenStorage: storage },
    )
    const refused = await client.guest.checkout(input).catch((error: unknown) => error)

    expect(isCheckoutError(refused)).toBe(true)
    expect(await storage.get()).toBe(TOKEN)
  })

  it('reads areas, pickup points and quotes from the guest routes', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client, calls } = createHarness([
      { body: { data: [], links: {}, meta: { request_id: 'r', current_page: 1, per_page: 20, last_page: 1, total: 0 } } },
      { body: { data: [], meta: { request_id: 'r' } } },
      { body: { data: { method: 'delivery', eta: null }, meta: { request_id: 'r' } } },
    ])

    await client.guest.areas.list({ filter: { level: 'city', active: false } })
    await client.guest.fulfillment.pickupLocations()
    await client.guest.fulfillment.quotes({ method: 'delivery', subtotal_minor: 25000, position: { longitude: 31.2, latitude: 30 } })

    expect(calls.map((call) => decodeURIComponent(call.path))).toEqual([
      '/api/v1/guest/areas?filter[level]=city&filter[active]=false',
      '/api/v1/guest/fulfillment/pickup-locations',
      '/api/v1/guest/fulfillment/quotes',
    ])
  })

  it('types the guest order customer as null and nothing else', () => {
    const read = (order: GuestOrder, signedIn: Order) => {
      // @ts-expect-error a guest order never names its customer.
      const id: string = order.customer.id

      return [id, signedIn.customer.id]
    }

    expect(read).toBeTypeOf('function')
  })
})

describe('sign-in by code', () => {
  it('requests a code and signs in with it on the otp routes', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const session = { auth_type: 'session', customer: { id: 'c-1', name: '', identity: { type: 'email', value: 'nour@example.test', verified_at: null } } }
    const { client, calls } = createHarness([
      { status: 202, body: { data: { status: 'accepted' }, meta: { request_id: 'r' } } },
      { body: { data: session, meta: { request_id: 'r' } } },
    ])

    expect(await client.auth.requestSignInCode('nour@example.test')).toEqual({ status: 'accepted' })
    expect(await client.auth.loginWithCode({ identity: 'nour@example.test', code: '123456' })).toEqual(session)
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      ['/api/v1/customer/auth/otp/request', { identity: 'nour@example.test' }],
      ['/api/v1/customer/auth/otp/verify', { identity: 'nour@example.test', code: '123456' }],
    ])
  })
})
