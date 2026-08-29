import { createMawjodClient, memoryCartTokenStorage, type MawjodClientOptions } from '../src/index.js'

export const BASE_URL = 'https://shop.test'

export interface RecordedCall {
  url: string
  path: string
  method: string
  headers: Headers
  body: Record<string, unknown> | null
}

export interface Stub {
  status?: number
  /** Serialized as JSON. Ignored when `raw` is set. */
  body?: unknown
  /** A body that is not JSON, e.g. a gateway's HTML error page. */
  raw?: string
  contentType?: string
  /** Simulates `Set-Cookie` by rewriting the fake cookie jar before the response resolves. */
  setCookie?: string
}

export interface Harness {
  client: ReturnType<typeof createMawjodClient>
  calls: RecordedCall[]
  /** Every problem+json error the client surfaced through `onError`. */
  reported: unknown[]
}

/**
 * Builds a client whose fetch answers from a fixed script, and records what was sent.
 * The last stub repeats, so a test only has to describe the calls it cares about.
 */
export function createHarness(stubs: Stub[], options: Partial<MawjodClientOptions> = {}): Harness {
  const calls: RecordedCall[] = []
  const reported: unknown[] = []
  let index = 0

  const fetchStub: typeof globalThis.fetch = async (input, init = {}) => {
    const url = String(input)

    calls.push({
      url,
      path: url.slice(BASE_URL.length),
      method: (init.method ?? 'GET').toUpperCase(),
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    })

    const stub = stubs[Math.min(index, stubs.length - 1)] ?? {}
    index += 1

    if (stub.setCookie !== undefined) {
      setCookieJar(stub.setCookie)
    }

    const status = stub.status ?? 200

    if (status === 204 || status === 205) {
      return new Response(null, { status })
    }

    const payload = stub.raw ?? JSON.stringify(stub.body ?? {})

    return new Response(payload, {
      status,
      headers: { 'Content-Type': stub.contentType ?? 'application/json' },
    })
  }

  const client = createMawjodClient({
    baseUrl: BASE_URL,
    fetch: fetchStub,
    cartTokenStorage: memoryCartTokenStorage(),
    onError: (error) => reported.push(error),
    ...options,
  })

  return { client, calls, reported }
}

/** Stands in for `document.cookie`, which does not exist under the node test environment. */
export function setCookieJar(value: string | null): void {
  const scope = globalThis as unknown as { document?: { cookie: string } }

  if (value === null) {
    delete scope.document
    return
  }

  scope.document = { cookie: value }
}

export function money(minor: number): Record<string, unknown> {
  return { minor, currency: 'EGP', tax_inclusive: true }
}

export function problem(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: `https://docs.mawjod/errors/${code.replace(/_/g, '-')}`,
    title: 'Request failed',
    status,
    detail: 'Prose that clients must not branch on.',
    instance: '/api/v1/whatever',
    code,
    request_id: 'req-problem',
    ...extra,
  }
}

/** A minimally valid order: at least one line, because the API never creates one without. */
export function orderPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'order-1',
    number: 'MW-20260818-A1B2C3D4',
    status: 'placed',
    placed_at: '2026-08-18T00:00:00+00:00',
    totals: {
      items_subtotal: money(259800),
      discount_total: money(0),
      delivery_fee: money(3000),
      total: money(262800),
      tax_amount: money(32271),
      tax_rate_basis_points: 1400,
    },
    fulfillment_method: 'delivery',
    discount_allocations: [],
    address: null,
    quote: {},
    lines: [
      {
        id: 'line-1',
        variant_id: 'variant-1',
        sku: 'SHIRT-BLUE-M',
        name_ar: 'قميص',
        name_en: 'Shirt',
        option_selection: {},
        quantity: 2,
        unit_price: money(129900),
        line_total: money(259800),
      },
    ],
    payment: null,
    fulfillment: null,
    history: [],
    ...overrides,
  }
}

export function cartPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cart-1',
    status: 'active',
    is_guest: true,
    guest_token: null,
    item_count: 1,
    subtotal: money(129900),
    has_unpurchasable_lines: false,
    lines: [],
    adjustments: [],
    last_activity_at: '2026-08-17T00:00:00+00:00',
    ...overrides,
  }
}
