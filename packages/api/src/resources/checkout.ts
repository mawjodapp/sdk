import type { Transport } from '../http.js'
import { guardOrder } from '../integrity.js'
import type { FulfillmentMethod, Order, PaymentMethod } from '../types.js'
import { uuidv7 } from '../uuid.js'

const IDEMPOTENCY_HEADER = 'Idempotency-Key'

export interface CheckoutInput {
  fulfillment_method: FulfillmentMethod
  /**
   * Not an enum. Read the offered set from `store.settings()` ->
   * `checkout.allowed_payment_methods`, or from a fulfillment quote. Choosing `paymob` places the
   * order *unpaid*; start the provider session with `orders.pay()` afterwards. Checkout itself
   * never takes money.
   */
  payment_method: PaymentMethod
  /** Required for `delivery`. */
  address_id?: string | null
  /** Required for `pickup`. */
  pickup_location_id?: string | null
  /** Merges a guest cart inline when it has not been merged yet. 64 characters. */
  guest_token?: string | null
  /** Optimistic-concurrency guard: the subtotal the buyer was last shown. A mismatch is a 409. */
  expected_items_subtotal_minor?: number | null
  /**
   * UUIDv7 identifying this attempt; it doubles as the stock reservation identity. Generated when
   * omitted. Reuse the same value when retrying the same attempt.
   */
  operation_id?: string
}

export interface CheckoutOptions {
  /**
   * The `Idempotency-Key` header. 16-128 printable ASCII characters; a UUIDv7 is a fine choice and
   * is what this client generates when you omit it.
   */
  idempotencyKey?: string
}

export interface CheckoutResult {
  order: Order
  /**
   * The key that was sent. Retry with this exact value — and the same `operationId` and the same
   * input — to replay rather than place a second order.
   */
  idempotencyKey: string
  operationId: string
}

export interface CheckoutNamespace {
  place(input: CheckoutInput, options?: CheckoutOptions): Promise<CheckoutResult>
}

export function createCheckoutNamespace(transport: Transport): CheckoutNamespace {
  return {
    place: async (input, options = {}) => {
      const idempotencyKey = options.idempotencyKey ?? uuidv7()
      const operationId = input.operation_id ?? uuidv7()

      const body: Record<string, unknown> = { ...input, operation_id: operationId }

      // The server overwrites any body `idempotency_key` with the header value before validating,
      // so sending one is at best noise and at worst a false sense of safety. The header is the
      // only authority.
      delete body['idempotency_key']

      const { data, meta } = await transport.dataWithMeta<Order>({
        method: 'POST',
        path: '/customer/checkout',
        body,
        headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      })

      return { order: guardOrder(data, meta), idempotencyKey, operationId }
    },
  }
}
