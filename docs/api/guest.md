# `guest`

Checkout for a shopper who is not signed in, plus the three reads that checkout needs: areas for a
delivery address, pickup points, and a fulfillment quote.

```ts
mawjod.guest.checkout(input, options?)
mawjod.guest.areas.list(query?)
mawjod.guest.fulfillment.pickupLocations()
mawjod.guest.fulfillment.quotes(input)
```

See [Checkout → Guest checkout](/guide/checkout#guest-checkout) for the flow beside the signed-in
one.

## When it is open

The public setting `checkout.guest_enabled` is the switch, and it is off by default. It only takes
effect while `auth.customer_verification_required` is off: a guest is never verified, so a store
that requires verification takes orders from signed-in customers only. Branch on both:

```ts
const { settings } = await mawjod.store.settings()
const guestCheckout =
  settings['checkout.guest_enabled']?.value === true &&
  settings['auth.customer_verification_required']?.value !== true
```

While that is false, every call on this page answers `403 guest_checkout_disabled`, before the body
is validated. Send the shopper to sign in instead.

## `guest.checkout()`

```ts
checkout(input: GuestCheckoutInput, options?: CheckoutOptions): Promise<GuestCheckoutResult>
```

`POST /api/v1/guest/checkout`. Buys the cart behind the guest token with cash on delivery.

```ts
const { order, idempotencyKey, operationId } = await mawjod.guest.checkout({
  customer: { email: 'nour@example.test', phone: '+201000000001', name: 'Nour Hassan' },
  fulfillment_method: 'delivery',
  payment_method: 'cod',
  address: {
    area_id: city.id,
    label: 'Home',
    recipient_name: 'Nour Hassan',
    recipient_phone: '+201000000001',
    line_one: '12 Gameat Al Dowal Al Arabeya',
    position: { longitude: 31.2001, latitude: 30.0444 },
  },
  expected_items_subtotal_minor: quote.discounted_subtotal.minor,
})
```

### `GuestCheckoutInput`

```ts
interface GuestCheckoutInput {
  customer: { email: string; phone: string; name?: string | null }
  fulfillment_method: 'delivery' | 'pickup'
  payment_method: 'cod'
  address?: GuestAddressInput | null
  pickup_location_id?: string | null
  guest_token?: string
  expected_items_subtotal_minor?: number | null
  operation_id?: string
}

type GuestAddressInput = Omit<AddressInput, 'is_default'>
```

| Field | Notes |
| --- | --- |
| `customer.email` | Required. The account with this email receives the order (phone, in phone identity mode). |
| `customer.phone` | Required, E.164. |
| `customer.name` | Optional, up to 120 characters. Kept on a new account only. |
| `payment_method` | `cod` only. A hosted gateway needs a signed-in customer to open its payment session. |
| `address` | Required for `delivery`, refused for `pickup`. The [`AddressInput`](/api/customer#addressinput) fields without `is_default`. |
| `pickup_location_id` | Required for `pickup`, from [`guest.fulfillment.pickupLocations()`](#guest-fulfillment-pickuplocations). |
| `guest_token` | The cart to buy. The client reads the stored token when you omit it, and throws a plain `Error` if there is none. |
| `expected_items_subtotal_minor` | Optimistic-concurrency guard. A mismatch is a `409`. |
| `operation_id` | UUIDv7 for this attempt; generated when omitted. |

The order goes to the account with that identity. When there is none, one is created with no
password; it can [sign in by code](/api/auth#sign-in-by-code) or set a password through password
recovery. A delivery address is saved to that account's address book. Nobody is signed in by this
call, and the response is identical whether the account existed or not.

Only the guest token's cart is bought, and promotions are priced as for any guest, so a coupon
limited to the account's own history does not apply here.

### Idempotency

The same pair as signed-in checkout: an `Idempotency-Key` header and an `operation_id` body field,
generated when you omit them and returned on the result. See
[`checkout` → The idempotency pair](/api/checkout#the-idempotency-pair).

The key is scoped to the guest token. The same key, token and body replays the original order, even
after checkout has released the token. A replay carries the same content, not the same bytes: the
stored response can come back with its keys in another order. The same key with a different body is a `409`.

On success the client clears the stored guest token, because the server released it with the cart
it bought. A transport failure leaves the token stored, so a retry under the same pair still finds
it.

### `GuestCheckoutResult`

```ts
interface GuestCheckoutResult {
  order: GuestOrder
  idempotencyKey: string
  operationId: string
}

type GuestOrder = Omit<Order, 'customer'> & { customer: null }
```

`customer` is always `null`, so the response never says whether the email already had an account.

The order comes back here once. Reading it again needs that account signed in, so render the
confirmation from this result rather than linking to an order page.

A delivery order carries the inline address and the zone's time:

```ts
order.fulfillment_method // 'delivery'
order.customer           // null
order.address            // { address_id: '01916f7a-…', label: 'Home', recipient_name: 'Nour Hassan', line_one: '12 Gameat Al Dowal Al Arabeya', line_two: 'Mohandessin', … }
order.fulfillment?.eta   // { minimum_minutes: 45, maximum_minutes: 90, unit: 'minute', minimum: 45, maximum: 90 }
```

A pickup order has no address:

```ts
order.fulfillment_method // 'pickup'
order.address            // null
order.quote              // { method: 'pickup', zone_id: null, pickup_location_id: '01916f7a-…', … }
order.fulfillment?.eta   // { minimum_minutes: 30, maximum_minutes: 60, unit: 'minute', minimum: 30, maximum: 60 }
```

A delivery from a zone that promises no time has a `null` estimate, on both the fulfillment and the
quote snapshot:

```ts
order.fulfillment_method // 'delivery'
order.fulfillment?.eta   // null: show no delivery-time line
order.quote.eta          // null
```

The payload integrity guard runs here as on signed-in checkout: an order with `lines: []` throws
`PayloadIntegrityError`.

## `guest.areas.list()`

```ts
list(query?: AreasQuery): Promise<Paginated<AdministrativeArea>>
```

`GET /api/v1/guest/areas`. The same areas, query and rows as
[`customer.areas.list()`](/api/customer#customer-areas-list): list the governorates, then the cities
inside the one the shopper picked, and send the deepest id as `address.area_id`.

## `guest.fulfillment.pickupLocations()`

```ts
pickupLocations(): Promise<PickupLocation[]>
```

`GET /api/v1/guest/fulfillment/pickup-locations`. The same bare array of
[`PickupLocation`](/api/fulfillment#fulfillment-pickuplocations) rows a signed-in customer gets.

## `guest.fulfillment.quotes()`

```ts
quotes(input: GuestQuoteInput): Promise<FulfillmentQuote>
```

`POST /api/v1/guest/fulfillment/quotes`. The signed-in quote, from a position instead of a saved
address.

```ts
interface GuestQuoteInput {
  method: 'delivery' | 'pickup'
  subtotal_minor: number
  pickup_location_id?: string | null   // required for pickup
  position?: GeoPosition | null        // required for delivery
}
```

The result is a [`FulfillmentQuote`](/api/fulfillment#fulfillmentquote), and `eta` follows the same
rule: an estimate, or `null` when the zone promises no time. A position outside every active zone
is `422 outside_service_area`.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `guest_checkout_disabled` | 403 | every call, while guest checkout is off |
| `cart_not_found` | 422 | `checkout`: no active cart behind the token |
| `payment_method_unavailable` | 422 | `checkout`: anything but `cod` |
| `outside_service_area` | 422 | `quotes` |
| the [checkout family](/api/checkout#failure-families) | 409 / 422 | `checkout` |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere; five guest checkouts a minute per address |
| `store_unavailable` | 503 | everywhere |

`isCheckoutError` covers `guest_checkout_disabled`, and `isStaleCartError` covers the same three
409s as on signed-in checkout.

## In Nuxt

```ts
const { place, retry, order, staleCart, isStale, pending } = useGuestCheckout()
const { pickupLocations, quote } = useGuestFulfillment()
const { data: areas } = useGuestAreas({ filter: { level: 'governorate' } })
```

`useGuestCheckout()` keeps the same attempt pair and retry rules as `useCheckout()`, and empties
the shared cart state on success. See [Composables → useGuestCheckout](/nuxt/composables#useguestcheckout).
