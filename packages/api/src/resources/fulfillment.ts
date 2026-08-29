import type { Transport } from '../http.js'
import type { FulfillmentMethod, FulfillmentQuote, GeoPosition, PickupLocation } from '../types.js'

export interface FulfillmentQuoteInput {
  method: FulfillmentMethod
  /** Tax-inclusive cart subtotal in minor units. */
  subtotal_minor: number
  /** Required for delivery unless `position` is given. */
  address_id?: string | null
  /** Required for pickup. */
  pickup_location_id?: string | null
  /** An ad-hoc destination, for a buyer who has not saved an address yet. */
  position?: GeoPosition | null
}

export interface FulfillmentNamespace {
  /**
   * Prices a delivery or pickup and returns the ETA plus the payment methods allowed for it.
   * A destination outside every active zone answers `422 outside_service_area`.
   */
  quotes(input: FulfillmentQuoteInput): Promise<FulfillmentQuote>
  /** Active pickup locations. Not paginated. Requires an authenticated customer. */
  pickupLocations(): Promise<PickupLocation[]>
}

export function createFulfillmentNamespace(transport: Transport): FulfillmentNamespace {
  return {
    quotes: (input) =>
      transport.data<FulfillmentQuote>({
        method: 'POST',
        path: '/customer/fulfillment/quotes',
        body: input,
      }),
    pickupLocations: () =>
      transport.array<PickupLocation>({
        method: 'GET',
        path: '/customer/fulfillment/pickup-locations',
      }),
  }
}
