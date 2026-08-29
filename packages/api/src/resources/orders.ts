import type { Transport } from '../http.js'
import { guardOrder, guardOrders } from '../integrity.js'
import type { FilterRange, SortValue } from '../query.js'
import type { Order, Paginated, PaymentSession } from '../types.js'
import { uuidv7 } from '../uuid.js'

export type OrderStatus = 'placed' | 'confirmed' | 'completed' | 'cancelled' | (string & {})

export type OrdersQuery = {
  page?: { number?: number | null; size?: number | null }
  /** `placed_at` or `number`, optionally `-` prefixed. The server appends an `id` tie-breaker. */
  sort?: SortValue
  filter?: {
    /** A set. An unknown value is a 422, not an empty result. */
    status?: OrderStatus[] | OrderStatus
    /** Inclusive. A bare date means the whole day in the store's timezone. */
    placed_at?: FilterRange
    /** Exact order number. */
    number?: string
    /** Free text over number, customer name, email and phone. */
    q?: string
  }
}

export interface CancelOrderInput {
  /** 3-500 characters. Recorded in the order's history. */
  reason: string
  /** UUIDv7. Pass the same value when retrying so the retry no-ops instead of racing. */
  operation_id?: string
}

export interface PayOrderInput {
  /** UUIDv7. Reusing it resumes the existing provider session instead of opening a second one. */
  operation_id?: string
}

export interface OrdersNamespace {
  list(query?: OrdersQuery): Promise<Paginated<Order>>
  get(orderId: string): Promise<Order>
  /**
   * Cancels within the cancellation window. Releases stock and fails an unsettled payment; a
   * settled payment goes to the refund flow instead. Past the window this is
   * `409 cancellation_window_closed`.
   */
  cancel(orderId: string, input: CancelOrderInput): Promise<Order>
  /**
   * Starts or resumes a provider payment session and returns a short-lived, single-use redirect.
   * Nothing settles here — only the provider's signed webhook marks a payment paid.
   */
  pay(orderId: string, input?: PayOrderInput): Promise<PaymentSession>
}

export function createOrdersNamespace(transport: Transport): OrdersNamespace {
  return {
    list: async (query) => {
      const page = await transport.list<Order>({ method: 'GET', path: '/customer/orders', query })

      guardOrders(page.data, page.meta)

      return page
    },

    get: async (orderId) => {
      const { data, meta } = await transport.dataWithMeta<Order>({
        method: 'GET',
        path: `/customer/orders/${encodeURIComponent(orderId)}`,
      })

      return guardOrder(data, meta)
    },

    cancel: async (orderId, input) => {
      const { data, meta } = await transport.dataWithMeta<Order>({
        method: 'POST',
        path: `/customer/orders/${encodeURIComponent(orderId)}/cancel`,
        body: { ...input, operation_id: input.operation_id ?? uuidv7() },
      })

      return guardOrder(data, meta)
    },

    pay: (orderId, input = {}) =>
      transport.data<PaymentSession>({
        method: 'POST',
        path: `/customer/orders/${encodeURIComponent(orderId)}/payment`,
        body: { operation_id: input.operation_id ?? uuidv7() },
      }),
  }
}
