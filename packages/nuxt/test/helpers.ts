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
    // Typed, so a field added to `CartLine` upstream fails the typecheck here rather than going
    // unbuilt everywhere in the suite. An empty cart has no line to build.
    lines:
      itemCount === 0
        ? []
        : [
            {
              id: 'line-1',
              variant_id: 'var-1',
              sku: 'SHIRT-BLUE-M',
              name_ar: 'قميص',
              name_en: 'Shirt',
              option_selection: {},
              quantity: itemCount,
              unit_price: { minor: 1000, currency: 'EGP', tax_inclusive: true },
              line_total: { minor: itemCount * 1000, currency: 'EGP', tax_inclusive: true },
              purchasable: true,
              product_slug: 'cotton-shirt',
              image: {
                id: 'img-1',
                url: 'https://cdn.test/shirt.webp',
                alt: 'A blue cotton shirt',
                renditions: {
                  thumbnail: { url: 'https://cdn.test/shirt-thumbnail.webp', width: 160, height: 160 },
                },
              },
            },
          ],
    adjustments: [],
    last_activity_at: null,
  }
}

export const customerFixture: Customer = {
  id: 'cus-1',
  name: 'Layla',
  identity: { type: 'email', value: 'layla@example.com', verified_at: '2026-01-01T00:00:00Z' },
}
