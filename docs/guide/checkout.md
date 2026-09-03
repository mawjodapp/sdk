# Checkout

Checkout turns a cart into an order. It never takes money: even a card order is placed unpaid and
the payment session starts afterwards.

Checkout requires an authenticated, verified customer. There is no guest checkout in release one.
A guest can hold a cart; they cannot place an order.

## The flow

```
cart.quote()                 price what the buyer is about to confirm
fulfillment.quotes()         delivery or pickup fee and ETA
store.settings()             which payment methods this store offers
checkout.place()             creates the order
orders.pay()                 only when the method needs a provider redirect
```

### 1. Price the cart

```ts
const quote = await mawjod.cart.quote()
```

Keep `quote.discounted_subtotal.minor`. It becomes the optimistic-concurrency guard in step 4.

### 2. Quote the fulfillment

```ts
const shipping = await mawjod.fulfillment.quotes({
  method: 'delivery',
  subtotal_minor: quote.discounted_subtotal.minor,
  address_id: address.id,
})

shipping.fee                      // Money
shipping.eta                      // { minimum_minutes, maximum_minutes }
shipping.free_threshold_applied   // boolean
shipping.allowed_payment_methods  // string[]
```

For pickup, pass `method: 'pickup'` and `pickup_location_id` instead. For a buyer who has not saved
an address yet, pass `position: { longitude, latitude }`.

A destination outside every active delivery zone is `422 outside_service_area`. Show it on the
address step, not on the payment step.

A quote accepts a bare position, but `place()` with `fulfillment_method: 'delivery'` accepts only a
saved `address_id`. Saving an address needs an `area_id`, and `customer.areas.list()` is where one
comes from: list the governorates, then the cities inside the one the shopper picked, and send the
id of the deepest area they chose. See [`customer.areas.list`](/api/customer#customer-areas-list).

### 3. Choose a payment method

`payment_method` is not an enum. `cod` is always offered; `paymob` only when the store has the
gateway configured. Never hardcode the list. Read it:

```ts
const settings = await mawjod.store.settings()
const methods = settings.settings['checkout.allowed_payment_methods']?.value as string[] | undefined
```

A fulfillment quote also carries `allowed_payment_methods`, narrowed to what is allowed for that
delivery zone or pickup location. When you have a quote, prefer it, because a pickup point may
accept less than the store does in general.

The type in the SDK is `PaymentMethod = 'cod' | 'paymob' | (string & {})`: the two known values
autocomplete, and a new one the deployment gains does not need an SDK release.

### 4. Place the order

```ts
const { order, idempotencyKey, operationId } = await mawjod.checkout.place({
  fulfillment_method: 'delivery',
  payment_method: 'cod',
  address_id: address.id,
  expected_items_subtotal_minor: quote.discounted_subtotal.minor,
})

console.log(order.number, order.status) // 'MJ-2026-000412' 'placed'
```

`place()` returns the order plus the two identifiers it used. Keep both for as long as the attempt
might be retried.

### 5. Pay, if payment needs a redirect

Do not infer this from the method. The server states it:

```ts
if (order.payment?.requires_action) {
  const session = await mawjod.orders.pay(order.id)

  window.location.assign(session.url)
}
```

Inferring it either strands a card buyer on an unpaid order or sends a cash buyer to a payment page
that does not exist.

The redirect is short-lived and single-use, and is never persisted server-side, so you cannot
re-read it, only start a new session. Nothing settles at this step either: only the provider's
signed webhook marks a payment paid, so poll the order rather than trusting the return URL.

## The idempotency pair

Checkout is protected by two values that must travel together:

| Value | Where it goes | What it is |
| --- | --- | --- |
| `Idempotency-Key` | request header | 16 to 128 printable ASCII characters. A UUIDv7 is a fine choice. |
| `operation_id` | request body | UUIDv7. It also identifies the stock reservation for this attempt. |

The client generates both when you do not supply them, and returns them on `CheckoutResult` so you
can retry with the same pair.

```ts
const result = await mawjod.checkout.place(input)
// result.idempotencyKey, result.operationId
```

To supply your own:

```ts
import { uuidv7 } from '@mawjod/api'

const operationId = uuidv7()
const idempotencyKey = uuidv7()

await mawjod.checkout.place(
  { ...input, operation_id: operationId },
  { idempotencyKey },
)
```

::: info Never send `idempotency_key` in the body
Scribe's generated docs show a body field by that name. It is not an input. The server overwrites
it from the header before validating, and the client deletes it from the body if it finds one. The
header is the only authority.
:::

### What the key is pinned to

The server hashes the key against exactly these fields:

```
operation_id
fulfillment_method
payment_method
address_id
pickup_location_id
expected_items_subtotal_minor
```

Send the same key with the same values and you get a replay: the original response, no second
order. Send the same key with any one of those values changed and you get a conflict, not a
replay. That is the whole rule, and it decides how you retry.

## Retrying, correctly

There are two failure shapes, and they want opposite treatment.

### Transport failures: reuse the pair

The request never got an answer, or the answer never got back: a dropped connection, a timeout, a
proxy hiccup. The order may or may not exist. Retry with the same input and the same key pair. The
server replays if it already placed the order, and places it if it did not.

```ts
import { isMawjodNetworkError } from '@mawjod/api'

let attempt = { idempotencyKey: uuidv7(), operationId: uuidv7() }
const input = { ...checkoutInput, operation_id: attempt.operationId }

try {
  return await mawjod.checkout.place(input, { idempotencyKey: attempt.idempotencyKey })
} catch (error) {
  if (isMawjodNetworkError(error)) {
    // Same input, same pair. This is the case the pair exists for.
    return await mawjod.checkout.place(input, { idempotencyKey: attempt.idempotencyKey })
  }

  throw error
}
```

In Nuxt this is what `useCheckout().retry()` is for. It replays the stored input under the stored
pair.

### Stale-cart failures: start fresh

`cart_price_changed`, `cart_not_purchasable` and `insufficient_stock` all mean the same thing: the
world moved under the buyer between the moment you priced the cart and the moment they confirmed.

Do not retry these. The buyer has not seen what they are now being charged, and reusing the key
with a corrected `expected_items_subtotal_minor` would be answered as a conflict anyway.

The sequence is: refetch, show, ask, then a fresh `place()` with a new pair.

```ts
import { isStaleCartError } from '@mawjod/api'

try {
  await mawjod.checkout.place(input, { idempotencyKey })
} catch (error) {
  if (!isStaleCartError(error)) {
    throw error
  }

  // 1. Refetch — the cart is the source of truth now, not your screen.
  const cart = await mawjod.cart.get()
  const quote = await mawjod.cart.quote()

  // 2. Show what changed. `error.detail` is prose for a human and carries no quantities or
  //    prices — the diff comes from comparing the new cart against what you had.
  showCartChanged({ cart, quote, code: error.code })

  // 3. Only after the buyer confirms, place again with a NEW pair.
  //    Do not reuse `operationId` or `idempotencyKey` here.
}
```

::: danger
Never silently retry a stale-cart failure. It is the one case where a "helpful" automatic retry
charges someone a price they never agreed to, or, when the key is reused with changed pinned
values, produces a conflict that looks like a bug in your theme.
:::

## Failure families

Every checkout failure has a `code`. Branch on it and nothing else.

| Code | Status | What it means | What to do |
| --- | --- | --- | --- |
| `cart_price_changed` | 409 | Prices moved since the cart was priced. | Refetch, show the change, fresh `place()`. |
| `cart_not_purchasable` | 409 | A line can no longer be sold. | Refetch, show the change, fresh `place()`. |
| `insufficient_stock` | 409 | Not enough stock for a line. | Refetch, show the change, fresh `place()`. |
| `cart_empty` | 422 | Nothing to order. | Send the buyer to the catalog. |
| `cart_not_found` | 422 | No cart for this caller. | Send the buyer to the catalog. |
| `payment_method_unavailable` | 422 | The chosen method is not offered here. | Re-read the allowed set and let them choose again. |
| `customer_not_verified` | 403 | Signed in, identity not verified, on a store that requires verification. | Verification screen, not the cart. |

Read as a rule: 409 means refetch, 422 means rewrite the request, 403 means send them to
verification.

`customer_not_verified` is conditional on the store. `auth.customer_verification_required` is off by
default, and while it is off an unverified customer places orders like anyone else and this code
never arrives. Handle it regardless: a store can turn the setting on after your theme ships. See
[Authentication → verification](/guide/authentication#verification).

Two guards cover the whole family:

```ts
import { isCheckoutError, isStaleCartError } from '@mawjod/api'

isStaleCartError(error) // the three 409s
isCheckoutError(error)  // all seven
```

`error.detail` never contains quantities, prices or addresses. It is prose written for a person and
reworded without notice. Do not parse it, and do not show it as the only explanation. Compute the
diff from the refetched cart instead.

## Inline guest-cart merge

A shopper who logs in on the checkout page may still have an unmerged guest cart. Rather than
calling `cart.merge()` first, pass the token to checkout:

```ts
await mawjod.checkout.place({
  ...input,
  guest_token: token,
})
```

The order is placed from the merged cart.

## A complete example

```ts
import { isStaleCartError, uuidv7 } from '@mawjod/api'

async function placeOrder(addressId: string, paymentMethod: string) {
  const quote = await mawjod.cart.quote()

  const attempt = { idempotencyKey: uuidv7(), operationId: uuidv7() }

  const input = {
    fulfillment_method: 'delivery' as const,
    payment_method: paymentMethod,
    address_id: addressId,
    operation_id: attempt.operationId,
    expected_items_subtotal_minor: quote.discounted_subtotal.minor,
  }

  try {
    const { order } = await mawjod.checkout.place(input, {
      idempotencyKey: attempt.idempotencyKey,
    })

    if (order.payment?.requires_action) {
      const session = await mawjod.orders.pay(order.id)

      return { order, redirectTo: session.url }
    }

    return { order, redirectTo: null }
  } catch (error) {
    if (isStaleCartError(error)) {
      return { staleCart: error.code, cart: await mawjod.cart.get() }
    }

    throw error
  }
}
```

## In Nuxt

`useCheckout()` holds the attempt pair, the result, and a dedicated `staleCart` ref:

```vue
<script setup lang="ts">
const { place, retry, order, staleCart, isStale, pending, error } = useCheckout()
const { refresh: refreshCart } = useCart()

async function submit() {
  try {
    await place({
      fulfillment_method: 'delivery',
      payment_method: method.value,
      address_id: addressId.value,
      expected_items_subtotal_minor: subtotalMinor.value,
    })
  } catch {
    if (isStale.value) {
      await refreshCart()
      // show what changed, then call place() again — never retry()
    }
  }
}
</script>
```

`retry()` replays the stored input under the stored pair. That is the transport-failure path only.
After a stale-cart failure, call `place()` again: it mints a new pair. See
[Composables → useCheckout](/nuxt/composables#usecheckout).
