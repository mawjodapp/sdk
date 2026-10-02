# Checkout

Checkout turns a cart into an order. It never takes money: even a card order is placed unpaid and
the payment session starts afterwards.

There are two ways in. A signed-in customer checks out through `checkout.place()`. A shopper who is
not signed in checks out through `guest.checkout()`, when the store has `checkout.guest_enabled` on
and `auth.customer_verification_required` off. With guest checkout off, a guest can hold a cart and
signs in to place the order. Verification gates checkout only on a store that turns it on.

```ts
const { settings } = await mawjod.store.settings()
const guestCheckout =
  settings['checkout.guest_enabled']?.value === true &&
  settings['auth.customer_verification_required']?.value !== true
```

The signed-in flow comes first below; [Guest checkout](#guest-checkout) follows it.

## The flow

```
cart.quote()                 price what the buyer is about to confirm
fulfillment.quotes()         delivery or pickup fee, and the ETA when the zone promises one
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
shipping.eta                      // { minimum_minutes, maximum_minutes, unit, minimum, maximum } or null
shipping.free_threshold_applied   // boolean
shipping.allowed_payment_methods  // string[]
```

`shipping.eta` is `null` when the zone promises no delivery time. Show the time only when it is
there, and say nothing otherwise:

```ts
shipping.eta // { minimum_minutes: 45, maximum_minutes: 90, unit: 'minute', minimum: 45, maximum: 90 }
shipping.eta // null: no delivery-time line
```

For pickup, pass `method: 'pickup'` and `pickup_location_id` instead. For a buyer who has not saved
an address yet, pass `position: { longitude, latitude }`.

A destination outside every active delivery zone is `422 outside_service_area`. Show it on the
address step, not on the payment step.

A quote accepts a bare position, but signed-in `place()` with `fulfillment_method: 'delivery'`
accepts only a saved `address_id`. (A guest checkout sends the address inline instead; see
[Guest checkout](#guest-checkout).) Saving an address needs an `area_id`, and
`customer.areas.list()` is where one comes from: list the governorates, then the cities inside the one the shopper picked, and send the
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

Send the same key with the same values and you get a replay: the original response's content, no
second order. Compare fields rather than bytes, because the stored body can come back with its keys
in another order. Send the same key with any one of those values changed and you get a conflict, not a
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
| `insufficient_stock` | 409 | Not enough stock for one or more lines; `variant_ids` names every one. | Refetch, show the change, fresh `place()`. |
| `cart_empty` | 422 | Nothing to order. | Send the buyer to the catalog. |
| `cart_not_found` | 422 | No cart for this caller. | Send the buyer to the catalog. |
| `payment_method_unavailable` | 422 | The chosen method is not offered here. | Re-read the allowed set and let them choose again. |
| `order_below_minimum` | 422 | The items subtotal is under the shop's minimum. | Name the minimum and send them back to the cart. |
| `order_above_maximum` | 422 | The items subtotal is over the shop's maximum. | Name the maximum and send them back to the cart. |
| `outside_ordering_hours` | 422 | Ordering is on, but the shop is closed at this hour. | Ask them to come back later; keep the cart. |
| `ordering_disabled` | 422 | The owner has switched ordering off. | Say the shop is not taking orders right now. |
| `customer_not_verified` | 403 | Signed in, identity not verified, on a store that requires verification. | Verification screen, not the cart. |
| `guest_checkout_disabled` | 403 | Guest checkout only: the store takes orders from signed-in customers. | Sign-in screen, keep the cart. |

Read as a rule: 409 means refetch, 422 means rewrite the request, 403 means send them to
verification or sign-in. The four ordering-rule 422s bend that rule, since no rewrite of the request clears
them. Below or above a bound, the shopper changes the cart; outside hours, they come back later;
switched off, they wait for the owner.

Name the bound in the message. `ordering.minimum_minor` and `ordering.maximum_minor` are public
settings in minor units, so format them with `formatMoney` rather than reading the figure out of
`detail`. See [Checkout → Ordering rules](/api/checkout#ordering-rules).

`insufficient_stock` carries `variant_ids`, every short variant rather than the first one found.
They match the cart lines already marked `in_stock: false`, so highlight all of them after the
refetch.

`customer_not_verified` is conditional on the store. `auth.customer_verification_required` is off by
default, and while it is off an unverified customer places orders like anyone else and this code
never arrives. Handle it regardless: a store can turn the setting on after your theme ships. See
[Authentication → verification](/guide/authentication#verification).

Two guards cover the whole family:

```ts
import { isCheckoutError, isStaleCartError } from '@mawjod/api'

isStaleCartError(error) // the three 409s
isCheckoutError(error)  // all twelve, guest_checkout_disabled included
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

## Guest checkout

When `guestCheckout` from the top of this page is true, a shopper who is not signed in can place a
cash order without an account step. Offer it beside "sign in", not instead of it.

```
guest.areas.list()                 the address picker, for delivery
guest.fulfillment.pickupLocations()   the pickup points, for pickup
cart.quote()                       price the cart
guest.fulfillment.quotes()         fee and ETA, from a position rather than a saved address
guest.checkout()                   places the order; nobody is signed in afterwards
```

What differs from the signed-in flow:

| | Signed in | Guest |
| --- | --- | --- |
| Who | the session | `customer: { email, phone, name? }` in the body |
| Delivery address | a saved `address_id` | the address fields inline, saved to the account |
| Areas, pickup points, quotes | `customer.*`, `fulfillment.*` | `guest.*` |
| Payment | anything the quote allows | `cod` only |
| `order.customer` | the customer | always `null` |
| Reading the order later | `orders.get()` | only after that account signs in |

```ts
const quote = await mawjod.cart.quote()

const shipping = await mawjod.guest.fulfillment.quotes({
  method: 'delivery',
  subtotal_minor: quote.discounted_subtotal.minor,
  position: { longitude: 31.2001, latitude: 30.0444 },
})

const { order } = await mawjod.guest.checkout({
  customer: { email: 'nour@example.test', phone: '+201000000001', name: 'Nour Hassan' },
  fulfillment_method: 'delivery',
  payment_method: 'cod',
  address: {
    area_id: cityId,
    label: 'Home',
    recipient_name: 'Nour Hassan',
    recipient_phone: '+201000000001',
    line_one: '12 Gameat Al Dowal Al Arabeya',
    position: { longitude: 31.2001, latitude: 30.0444 },
  },
  expected_items_subtotal_minor: quote.discounted_subtotal.minor,
})
```

For pickup, send `fulfillment_method: 'pickup'` and a `pickup_location_id` and leave `address` out;
the order comes back with `address: null`. A zone that promises no time gives `fulfillment.eta:
null`, the same as on the signed-in side. All three shapes are on
[`guest` → GuestCheckoutResult](/api/guest#guestcheckoutresult).

The order goes to the account with that email (phone, on a store in phone identity mode), and one is
created when there is none. The response is the same either way and `order.customer` is always
`null`, so a theme cannot tell a returning shopper from a new one and should not try. Render the
confirmation from the result: the order cannot be read again until that account signs in. An account
the checkout created has no password, so point the shopper at [sign-in by
code](/guide/authentication#sign-in-by-code) or password recovery for their order history.

The idempotency pair, the stale-cart rules and the failure families are the ones above. The client
reads the guest cart token from storage and clears it once the order is placed, because the server
releases it with the cart. `403 guest_checkout_disabled` means the setting changed under the theme;
send the shopper to sign in.

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

The guest flow has the same shape in `useGuestCheckout()`, with `useGuestFulfillment()` and
`useGuestAreas()` for the address step. It empties the shared cart state once the order is placed.
See [Composables → useGuestCheckout](/nuxt/composables#useguestcheckout).
