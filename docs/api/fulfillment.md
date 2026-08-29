# `fulfillment`

Delivery and pickup quoting, and the list of pickup points. Both calls require an authenticated
customer, including the pickup-locations list, which is not public.

```ts
mawjod.fulfillment.quotes(input)
mawjod.fulfillment.pickupLocations()
```

## `fulfillment.quotes()`

```ts
quotes(input: FulfillmentQuoteInput): Promise<FulfillmentQuote>
```

`POST /api/v1/customer/fulfillment/quotes`. Prices a delivery or a pickup and returns the ETA plus
the payment methods allowed for it.

```ts
interface FulfillmentQuoteInput {
  method: 'delivery' | 'pickup'
  subtotal_minor: number              // tax-inclusive cart subtotal, >= 0
  address_id?: string | null          // a saved address owned by the caller
  pickup_location_id?: string | null
  position?: GeoPosition | null       // an ad-hoc destination
}
```

```ts
const quote = await mawjod.cart.quote()

const delivery = await mawjod.fulfillment.quotes({
  method: 'delivery',
  subtotal_minor: quote.discounted_subtotal.minor,
  address_id: address.id,
})
```

`subtotal_minor` is minor units. See [Money](/guide/money). Feed it
`CartQuote.discounted_subtotal.minor` so the free-delivery threshold is evaluated against what the
shopper will actually pay.

For a buyer who has not saved an address yet, pass `position` instead of `address_id`:

```ts
await mawjod.fulfillment.quotes({
  method: 'delivery',
  subtotal_minor: quote.discounted_subtotal.minor,
  position: { longitude: 31.2357, latitude: 30.0444 },
})
```

For pickup, pass `pickup_location_id`.

### `FulfillmentQuote`

```ts
interface FulfillmentQuote {
  method: 'delivery' | 'pickup'
  zone_id: string | null
  pickup_location_id: string | null
  rule_version: number
  subtotal: Money
  fee: Money
  minimum_order: Money
  free_threshold: Money | null
  free_threshold_applied: boolean
  eta: { minimum_minutes: number; maximum_minutes: number }
  allowed_payment_methods: string[]
}
```

`free_threshold` is `null` when the store has no free-delivery threshold at all. Do not render a
"spend X more for free delivery" prompt without checking for that.

`minimum_order` is the smallest order this zone or pickup point accepts. Compare it against the cart
subtotal before letting the shopper move on.

`allowed_payment_methods` is the authoritative list for this quote, narrower than the store-wide
set from [`store.settings()`](/api/store#store-settings), because a particular pickup point may
accept less than the store does in general. When you have a quote, render from it.

### Outside the service area

```ts
import { isMawjodApiError } from '@mawjod/api'

try {
  await mawjod.fulfillment.quotes(input)
} catch (error) {
  if (isMawjodApiError(error) && error.code === 'outside_service_area') {
    // The destination is outside every active zone. Offer pickup instead.
  } else {
    throw error
  }
}
```

`422 outside_service_area` means the destination is outside every active delivery zone. Show it on
the address step, not on the payment step. It is a fact about the address, and the shopper should
find out while they are still looking at addresses.

## `fulfillment.pickupLocations()`

```ts
pickupLocations(): Promise<PickupLocation[]>
```

`GET /api/v1/customer/fulfillment/pickup-locations`. Active pickup locations. Not paginated: a
bare array.

```ts
interface PickupLocation {
  id: string
  name_ar: string
  name_en: string
  address_line: string
  contact_phone: string | null
  ready: { minimum_minutes: number; maximum_minutes: number }
  allowed_payment_methods: string[]
  operating_windows: OperatingWindow[]
  collection_instructions_ar: string | null
  collection_instructions_en: string | null
  is_active: boolean
  area: AdministrativeAreaRef | null
  created_at: string | null
  updated_at: string | null
}
```

`name_ar` / `name_en` and `collection_instructions_ar` / `collection_instructions_en` carry both
locales; pick by the locale you are rendering.

`operating_windows` is the weekly collection schedule, and a theme renders the opening hours from
it:

```ts
interface OperatingWindow {
  day: number      // 0 to 6
  opens: string    // "HH:MM"
  closes: string   // "HH:MM"
}
```

An empty array means the location is always open. That is a statement, not a gap in the data, so
render it as "open 24 hours" rather than hiding the hours or reading it as closed. `ready` is the
separate field, and is the one to show as "ready in 30 to 60 minutes".

`is_active` is on the shape, but the endpoint only returns active locations, so filtering on it
should never change anything.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `outside_service_area` | 422 | `quotes` |
| `unauthenticated` | 401 | both |
| `validation_failed` | 422 | both |
| `rate_limited` | 429 | both |
| `store_unavailable` | 503 | both |

## In Nuxt

```ts
const { pickupLocations, quote, lastQuote, quoting, quoteError } = useFulfillment()
```

Pickup locations are page data and load on setup; a quote is a `POST` that depends on the chosen
address, so it is invoked.

::: tip
`useFulfillment()` fetches pickup locations on setup. Pass `{ immediate: false }` when a page only
needs `quote()`:

```ts
const { quote } = useFulfillment({ immediate: false })
```
:::

See [Composables → useFulfillment](/nuxt/composables#usefulfillment).
