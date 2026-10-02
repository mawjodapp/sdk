import type { Transport } from '../http.js'
import { guardOrder } from '../integrity.js'
import type {
  AdministrativeArea,
  FulfillmentMethod,
  FulfillmentQuote,
  GeoPosition,
  GuestOrder,
  Paginated,
  PickupLocation,
} from '../types.js'
import { uuidv7 } from '../uuid.js'
import type { CheckoutOptions } from './checkout.js'
import type { AddressInput, AreasQuery } from './customer.js'

/** Who the order is for. The account with this identity receives it, created when none exists. */
export interface GuestCustomerInput {
  email: string
  /** E.164, e.g. `+201000000001`. */
  phone: string
  /** Kept on a new account only. */
  name?: string | null
}

/** The customer address fields minus `is_default`. The account's address book keeps it. */
export type GuestAddressInput = Omit<AddressInput, 'is_default'>

export interface GuestCheckoutInput {
  customer: GuestCustomerInput
  fulfillment_method: FulfillmentMethod
  /** Cash on delivery only: a hosted gateway needs a signed-in customer to open its session. */
  payment_method: 'cod'
  /** Required for `delivery`, refused for `pickup`. Areas come from `guest.areas.list()`. */
  address?: GuestAddressInput | null
  /** Required for `pickup`, from `guest.fulfillment.pickupLocations()`. */
  pickup_location_id?: string | null
  /** The cart to buy. Read from the stored guest cart token when omitted. */
  guest_token?: string
  /** Optimistic-concurrency guard: the subtotal the buyer was last shown. A mismatch is a 409. */
  expected_items_subtotal_minor?: number | null
  /** UUIDv7, also the stock reservation identity. Generated when omitted; reuse it on a retry. */
  operation_id?: string
}

export interface GuestCheckoutResult {
  order: GuestOrder
  idempotencyKey: string
  operationId: string
}

/** The signed-in quote input with a position in place of a saved address. */
export interface GuestQuoteInput {
  method: FulfillmentMethod
  /** Tax-inclusive cart subtotal in minor units. */
  subtotal_minor: number
  /** Required for pickup. */
  pickup_location_id?: string | null
  /** Required for delivery. */
  position?: GeoPosition | null
}

/**
 * `/guest/*`, open while `checkout.guest_enabled` is on and `auth.customer_verification_required`
 * is off. Otherwise every call answers `403 guest_checkout_disabled`, before validation.
 */
export interface GuestNamespace {
  /**
   * Places a cash order for the cart behind the guest token. Nobody is signed in by it, and the
   * stored token is cleared on success: the server has released it.
   */
  checkout(input: GuestCheckoutInput, options?: CheckoutOptions): Promise<GuestCheckoutResult>
  areas: {
    /** The same areas a signed-in customer is offered. */
    list(query?: AreasQuery): Promise<Paginated<AdministrativeArea>>
  }
  fulfillment: {
    /** Not paginated. */
    pickupLocations(): Promise<PickupLocation[]>
    /** `422 outside_service_area` for a position no active zone serves. */
    quotes(input: GuestQuoteInput): Promise<FulfillmentQuote>
  }
}

export function createGuestNamespace(transport: Transport): GuestNamespace {
  return {
    checkout: async (input, options = {}) => {
      const token = input.guest_token ?? (await transport.readCartToken())

      if (token === null || token === '') {
        throw new Error(
          'guest.checkout needs a guest cart token, and none was passed or stored. There is no ' +
            'cart to buy.',
        )
      }

      const idempotencyKey = options.idempotencyKey ?? uuidv7()
      const operationId = input.operation_id ?? uuidv7()
      const body: Record<string, unknown> = { ...input, guest_token: token, operation_id: operationId }

      // Same as signed-in checkout: the header is the only authority.
      delete body['idempotency_key']

      const { data, meta } = await transport.dataWithMeta<GuestOrder>({
        method: 'POST',
        path: '/guest/checkout',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      const order = guardOrder(data, meta)

      await transport.clearCartToken()

      return { order, idempotencyKey, operationId }
    },
    areas: {
      list: (query) =>
        transport.list<AdministrativeArea>({ method: 'GET', path: '/guest/areas', query }),
    },
    fulfillment: {
      pickupLocations: () =>
        transport.array<PickupLocation>({ method: 'GET', path: '/guest/fulfillment/pickup-locations' }),
      quotes: (input) =>
        transport.data<FulfillmentQuote>({ method: 'POST', path: '/guest/fulfillment/quotes', body: input }),
    },
  }
}
