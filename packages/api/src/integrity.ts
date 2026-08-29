import { PayloadIntegrityError } from './errors.js'
import type { ApiMeta, Order, Return, SearchProductHit } from './types.js'

/**
 * An order or a return always has at least one line — the server creates neither without one.
 * So `lines: []` is not an empty state; it is a payload that lost its lines somewhere between the
 * database and here, arriving as a well-formed 200.
 *
 * Rendering that shows a buyer an order that appears to contain nothing. Failing loudly, carrying
 * the request id, is the only honest option.
 */
export function guardOrder(order: Order, meta: ApiMeta | null): Order {
  return guard(order, 'order', meta)
}

export function guardReturn(value: Return, meta: ApiMeta | null): Return {
  return guard(value, 'return', meta)
}

/** List items get the same treatment as detail reads: one bad row poisons the whole page. */
export function guardOrders(orders: Order[], meta: ApiMeta | null): Order[] {
  for (const order of orders) {
    guard(order, 'order', meta)
  }

  return orders
}

export function guardReturns(values: Return[], meta: ApiMeta | null): Return[] {
  for (const value of values) {
    guard(value, 'return', meta)
  }

  return values
}

/**
 * A search hit is only useful because it can be followed, and `slug` is the whole address: the
 * server reads every document field off the index with a fallback, so a misconfigured index
 * projects a hit whose shape is perfect and whose slug is `''`. An empty slug is a lost projection,
 * not a product without an address.
 *
 * Same stance as `guardOrders`: one bad row poisons the page, because a page that quietly drops the
 * unlinkable rows is a page nobody ever finds out is broken.
 */
export function guardSearchHits(
  hits: SearchProductHit[],
  meta: ApiMeta | null,
): SearchProductHit[] {
  for (const hit of hits) {
    const slug: unknown = hit?.slug

    if (typeof slug !== 'string' || slug === '') {
      throw new PayloadIntegrityError('search_hit', idOf(hit), meta?.request_id)
    }
  }

  return hits
}

function guard<T extends Order | Return>(resource: T, kind: 'order' | 'return', meta: ApiMeta | null): T {
  const lines: unknown = resource?.lines

  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PayloadIntegrityError(kind, idOf(resource), meta?.request_id)
  }

  return resource
}

function idOf(resource: unknown): string | null {
  if (typeof resource === 'object' && resource !== null && 'id' in resource) {
    const id = (resource as { id: unknown }).id

    if (typeof id === 'string') {
      return id
    }
  }

  return null
}
