# `checkout`

Turns a cart into an order. Requires an authenticated, verified customer. There is no guest
checkout in release one.

Checkout never takes money. Even a card order is placed unpaid; the payment session starts
afterwards with [`orders.pay`](/api/orders#orders-pay).

See [Checkout](/guide/checkout) for the full flow, retry rules and failure handling.

```ts
mawjod.checkout.place(input, options?)
```

## `checkout.place()`

```ts
place(input: CheckoutInput, options?: CheckoutOptions): Promise<CheckoutResult>
```

`POST /api/v1/customer/checkout`.

```ts
const { order, idempotencyKey, operationId } = await mawjod.checkout.place({
  fulfillment_method: 'delivery',
  payment_method: 'cod',
  address_id: address.id,
  expected_items_subtotal_minor: quote.discounted_subtotal.minor,
})
```

### `CheckoutInput`

```ts
interface CheckoutInput {
  fulfillment_method: 'delivery' | 'pickup'
  payment_method: string
  address_id?: string | null
  pickup_location_id?: string | null
  guest_token?: string | null
  expected_items_subtotal_minor?: number | null
  operation_id?: string
}
```

| Field | Notes |
| --- | --- |
| `fulfillment_method` | `delivery` or `pickup` |
| `payment_method` | **Not an enum.** See below. |
| `address_id` | Required for `delivery` |
| `pickup_location_id` | Required for `pickup` |
| `guest_token` | 64 characters. Merges an unmerged guest cart inline. |
| `expected_items_subtotal_minor` | Optimistic-concurrency guard. A mismatch is a `409`. |
| `operation_id` | UUIDv7 identifying this attempt; generated when omitted |

### `payment_method` is not an enum

`cod` is always offered. `paymob` only exists when the deployment has the gateway configured. A
future method needs no SDK release, which is why the type is
`PaymentMethod = 'cod' | 'paymob' | (string & {})`.

Read the offered set at runtime, from
[`store.settings()`](/api/store#store-settings) →
`checkout.allowed_payment_methods`, or from a
[fulfillment quote's](/api/fulfillment) `allowed_payment_methods`, which is narrowed to the chosen
zone or pickup point. Prefer the quote when you have one.

Choosing `paymob` places the order unpaid. Read `order.payment.requires_action` afterwards; do
not infer it from the method.

### `CheckoutOptions`

```ts
interface CheckoutOptions {
  idempotencyKey?: string
}
```

Sent as the `Idempotency-Key` header. 16 to 128 printable ASCII characters; a UUIDv7 is a fine
choice and is what the client generates when you omit it.

::: info Never send `idempotency_key` in the body
Scribe's generated docs show a body field by that name. It is not an input. The server overwrites
it from the header before validating, and the client deletes it from the body if it finds one. The
header is the only authority.
:::

### `CheckoutResult`

```ts
interface CheckoutResult {
  order: Order
  idempotencyKey: string
  operationId: string
}
```

Both identifiers come back so a retry can reuse them. Keep them for as long as the attempt might be
retried.

## The idempotency pair

Two values travel together and must both be reused for a replay:

| Value | Where | What |
| --- | --- | --- |
| `Idempotency-Key` | header | 16 to 128 printable ASCII characters |
| `operation_id` | body | UUIDv7; also the stock-reservation identity |

The server hashes the key against exactly these fields:

```
operation_id
fulfillment_method
payment_method
address_id
pickup_location_id
expected_items_subtotal_minor
```

Same key, same values → replay of the original response. Same key, any one of those changed →
conflict, not a replay.

### Retry semantics

Transport failure: the request never got an answer, or the answer never got back. The order may
or may not exist. Retry with the same input and the same pair; the server replays if it already
placed the order.

Stale-cart failure: `cart_price_changed`, `cart_not_purchasable` or `insufficient_stock`. Do
not retry. Refetch the cart, show what changed, ask the shopper to confirm, then call `place()`
again with a fresh pair. Reusing the key with a corrected
`expected_items_subtotal_minor` is answered as a conflict, not a replay, and silently retrying
would charge someone a price they never agreed to.

## Failure families

| Code | Status | Meaning | Response |
| --- | --- | --- | --- |
| `cart_price_changed` | 409 | Prices moved | Refetch, show, fresh `place()` |
| `cart_not_purchasable` | 409 | A line can no longer be sold | Refetch, show, fresh `place()` |
| `insufficient_stock` | 409 | Not enough stock | Refetch, show, fresh `place()` |
| `cart_empty` | 422 | Nothing to order | Send them to the catalogue |
| `cart_not_found` | 422 | No cart for this caller | Send them to the catalogue |
| `payment_method_unavailable` | 422 | Method not offered here | Re-read the allowed set |
| `customer_not_verified` | 403 | Identity not verified, where the store requires it | Verification screen, not the cart |

409 means refetch. 422 means rewrite the request. 403 means route to verification.

The 403 only exists on a store that has turned on `auth.customer_verification_required`, which is
off by default. See [`store.settings()` → Verification](/api/store#verification).

```ts
import { isCheckoutError, isStaleCartError } from '@mawjod/api'

isStaleCartError(error)  // the three 409s
isCheckoutError(error)   // all seven
```

`error.detail` never contains quantities, prices or addresses. Do not parse it. Compute the diff
from the refetched cart.

`401 unauthenticated`, `422 validation_failed`, `429 rate_limited` and `503 store_unavailable` apply
as everywhere else.

## The returned order

`place()` runs the payload integrity guard: an order with `lines: []` throws
`PayloadIntegrityError` rather than resolving, because an order is created from at least one cart
line and an empty one is a lost payload arriving as a valid `201`. See
[Errors → the integrity guard](/guide/errors#the-integrity-guard).

The `Order` shape is documented on [`orders`](/api/orders#order).

## In Nuxt

```ts
const { place, retry, order, attempt, staleCart, isStale, pending, reset } = useCheckout()
```

`useCheckout()` mints the pair before the call and keeps it on `attempt`, because an attempt that
fails is exactly the one that needs retrying under the same key. `retry()` replays the stored input
under the stored pair, which is the transport-failure path only. See
[Composables → useCheckout](/nuxt/composables#usecheckout).
