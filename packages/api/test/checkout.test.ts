import { afterEach, describe, expect, it } from 'vitest'

import { createHarness, orderPayload, setCookieJar } from './helpers.js'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  setCookieJar(null)
})

describe('checkout idempotency', () => {
  it('generates the header key and the operation id, and never puts the key in the body', async () => {
    setCookieJar('XSRF-TOKEN=tok')

    const { client, calls } = createHarness([
      { status: 201, body: { data: orderPayload(), meta: { request_id: 'req-checkout' } } },
    ])

    const result = await client.checkout.place({
      fulfillment_method: 'delivery',
      payment_method: 'cod',
      address_id: 'address-1',
    })

    const sent = calls[0]!

    expect(sent.headers.get('Idempotency-Key')).toBe(result.idempotencyKey)
    expect(result.idempotencyKey).toMatch(UUID_V7)
    expect(result.operationId).toMatch(UUID_V7)
    expect(sent.body?.['operation_id']).toBe(result.operationId)

    // The server overwrites any body `idempotency_key` from the header before validating, so
    // sending one is at best noise and at worst a false sense of safety.
    expect(sent.body).not.toHaveProperty('idempotency_key')

    // The two are distinct identities, not the same value under two names.
    expect(result.idempotencyKey).not.toBe(result.operationId)
    expect(result.order.number).toBe('MW-20260818-A1B2C3D4')
  })

  it('replays a retry with the caller-supplied key and operation id unchanged', async () => {
    setCookieJar('XSRF-TOKEN=tok')

    const { client, calls } = createHarness([
      { status: 201, body: { data: orderPayload(), meta: { request_id: 'req-a' } } },
      { status: 201, body: { data: orderPayload(), meta: { request_id: 'req-b' } } },
    ])

    const input = {
      fulfillment_method: 'delivery' as const,
      payment_method: 'cod',
      address_id: 'address-1',
      operation_id: '01916f7a-bcde-7abc-8def-c123456789ab',
    }

    const first = await client.checkout.place(input, { idempotencyKey: 'retry-key-0123456789' })
    const second = await client.checkout.place(input, { idempotencyKey: first.idempotencyKey })

    expect(calls[0]!.headers.get('Idempotency-Key')).toBe('retry-key-0123456789')
    // A retry that changed either value would place a second order rather than replaying the first:
    // the server hashes operation_id together with the fulfillment and payment fields.
    expect(calls[1]!.headers.get('Idempotency-Key')).toBe('retry-key-0123456789')
    expect(calls[1]!.body?.['operation_id']).toBe(input.operation_id)
    expect(second.operationId).toBe(first.operationId)
  })
})
