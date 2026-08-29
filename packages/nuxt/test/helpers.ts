import type { Cart, Customer } from '@mawjod/api'
import { vi } from 'vitest'

export interface RecordedCall {
  url: string
  method: string
  headers: Headers
  body: string | undefined
}

/**
 * Replaces the global `fetch` the client resolves at construction time, and records what it was
 * asked for. Pair with `vi.unstubAllGlobals()`.
 */
export function stubFetch(
  respond: (call: RecordedCall) => Response | Promise<Response>,
): RecordedCall[] {
  const calls: RecordedCall[] = []

  vi.stubGlobal('fetch', async (input: unknown, init: RequestInit = {}): Promise<Response> => {
    const call: RecordedCall = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? init.body : undefined,
    }

    calls.push(call)

    return respond(call)
  })

  return calls
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function cartFixture(itemCount: number, id = 'cart-1'): Cart {
  return {
    id,
    status: 'active',
    is_guest: false,
    guest_token: null,
    item_count: itemCount,
    subtotal: { minor: itemCount * 1000, currency: 'EGP', tax_inclusive: true },
    has_unpurchasable_lines: false,
    lines: [],
    adjustments: [],
    last_activity_at: null,
  }
}

export const customerFixture: Customer = {
  id: 'cus-1',
  name: 'Layla',
  identity: { type: 'email', value: 'layla@example.com', verified_at: '2026-01-01T00:00:00Z' },
}
