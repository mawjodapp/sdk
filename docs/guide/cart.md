# Cart

A shopper can fill a cart without an account. That guest cart is identified by a token the server
hands out exactly once, and the client's main job here is to not lose it.

## Guest carts and the capture-once token

The first write to an empty guest cart, an `addLine`, creates the cart and answers `201` with
`data.guest_token`, a 64-character hex string. Every later response carries `guest_token: null`,
and the server cannot reissue it. Lose the token and the cart is unreachable: there is no recovery
endpoint and no lookup by session.

`@mawjod/api` handles this without you asking:

- It watches every response for a non-null `data.guest_token` and stores it on sight.
- It sends the stored token as `X-Mawjod-Cart-Token` on every subsequent `/cart` call.
- It never overwrites a stored token with the `null` that later responses carry.

So the ordinary path is just:

```ts
const cart = await mawjod.cart.addLine({ variant_id: variant.id, quantity: 1 })

console.log(cart.item_count, cart.is_guest, cart.guest_token) // 1 true '9f3c…'
```

and every call after that reaches the same cart.

::: tip
Cart identity is the `X-Mawjod-Cart-Token` header, not the session cookie. That is deliberate: it
survives a session cookie being cleared, and it is what makes merge-on-login possible.
:::

## Reading and changing a cart

```ts
const cart = await mawjod.cart.get()
```

`cart.id` is `null` when the caller has no cart yet. The API answers a zeroed cart rather than a
`404`, so you do not need to special-case "no cart" as an error.

```ts
await mawjod.cart.addLine({ variant_id, quantity: 2 })   // 1-999; sums into an identical line
await mawjod.cart.updateLine(lineId, 3)                  // replaces the quantity
await mawjod.cart.removeLine(lineId)
```

Each returns the whole refreshed `Cart`, so you can write the response straight into your state
rather than patching locally.

`AddCartLineInput` also accepts `options`, which is reserved: release one accepts only `{}`. Leave
it out.

Adding a variant that cannot be sold is `409 variant_not_purchasable`. A cart that already holds
one flags it on the cart rather than on the line you just touched:

```ts
if (cart.has_unpurchasable_lines) {
  // at least one line has purchasable: false — show it, and block checkout
}
```

## Prices live on the quote, not the cart

`Cart` carries `subtotal` and per-line `unit_price` / `line_total`. Discounts, tax and promotions do
not appear there. For those, ask for a quote:

```ts
const quote = await mawjod.cart.quote()

quote.subtotal              // Money
quote.discount_total        // Money
quote.discounted_subtotal   // Money
quote.tax_amount            // Money
quote.tax_rate_basis_points // e.g. 1400 for 14%
quote.applied_discount      // AppliedDiscount | null
quote.lines                 // [{ line_id, gross, discount, net }]
quote.rejected_discounts    // discounts that did not apply
```

`quote()` reprices and re-evaluates promotions; it does not mutate the cart. Call it on the cart
page and again before checkout.

## Coupons

```ts
import { isMawjodApiError } from '@mawjod/api'

try {
  const quote = await mawjod.cart.applyCoupon('EID25')
  console.log(quote.applied_discount?.coupon_code)
} catch (error) {
  if (isMawjodApiError(error) && error.code === 'pricing_conflict') {
    // The code was refused. `error.problem.reason` may say why, e.g. 'expired'.
  } else {
    throw error
  }
}
```

Both coupon calls return a `CartQuote`, not a `Cart`. One refusal code covers every reason a code
can fail: unknown, inactive, expired, not qualified, fully redeemed, or beaten by a better
automatic promotion. When the server sends a `reason` on the problem document, that carries the
detail. Codes are matched case-insensitively and are 3 to 40 characters.

```ts
const quote = await mawjod.cart.removeCoupon() // applied_discount is null
```

## Storage adapters

By default the token goes to `localStorage` under `mawjod:cart_token` in a browser, and to memory
everywhere else. Every `localStorage` access is wrapped in a `try`, because a browser configured to
block site data throws rather than returning `null`, and a cart token is not worth crashing a page
over.

Three factories are exported:

```ts
import {
  CART_TOKEN_STORAGE_KEY,        // 'mawjod:cart_token'
  defaultCartTokenStorage,       // localStorage in a browser, memory elsewhere
  localStorageCartTokenStorage,  // localStorageCartTokenStorage(key?)
  memoryCartTokenStorage,        // memoryCartTokenStorage(initial?)
} from '@mawjod/api'
```

Supply your own with the `cartTokenStorage` option. The interface is two methods, either of which
may be async:

```ts
interface CartTokenStorage {
  get(): string | null | Promise<string | null>
  set(token: string | null): void | Promise<void>
}
```

A cookie-backed adapter, so the token survives into SSR:

```ts
import { createMawjodClient } from '@mawjod/api'

const mawjod = createMawjodClient({
  baseUrl: 'http://localhost:8000',
  cartTokenStorage: {
    get: () => readCookie('mawjod_cart') ?? null,
    set: (token) => {
      if (token === null) {
        deleteCookie('mawjod_cart')
      } else {
        writeCookie('mawjod_cart', token, { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' })
      }
    },
  },
})
```

::: warning Guest cart writes during SSR are not supported
On the server the client defaults to in-memory storage, which lives for exactly one request. A
guest token created during SSR is written into an object that is discarded when the render ends and
is never visible to the browser afterwards, so the cart it created becomes unreachable. Do guest
cart writes in the browser. `@mawjod/nuxt` enforces this by giving the server in-memory storage
explicitly. See [SSR → what is not supported](/guide/ssr#what-is-not-supported).
:::

## Merge on login

A guest cart and a customer cart are different carts. After login, hand the guest one over:

```ts
await mawjod.auth.login({ identity, password })
await mawjod.cart.merge()
```

`merge()` defaults to the stored guest token, so you rarely pass anything. Pass one explicitly when
you kept it somewhere the client cannot see:

```ts
await mawjod.cart.merge('9f3c…')
```

The merge is additive and deterministic: identical lines sum, guest-only lines move across, and
replaying the same token merges only once. The result reports what happened:

```ts
const cart = await mawjod.cart.merge()

cart.is_guest        // false
cart.adjustments     // [{ reason: 'merged_quantity_summed', line_id, variant_id,
                     //    previous_quantity, quantity }]
```

On success the client clears the stored token, because the guest cart no longer exists and
replaying a dead token would be noise. `merge()` throws a plain `Error` if no token was passed and
none is stored:
there is genuinely nothing to merge, and that is a programming mistake rather than an API failure.

::: info A deliberate contract inconsistency
Every other cart call carries the guest token in the `X-Mawjod-Cart-Token` header.
`POST /cart/merge` takes it in the request body as `guest_token`. The client papers over this, but
it is worth knowing if you ever read the network tab and wonder.
:::

Checkout can also merge inline, by passing `guest_token` in the checkout body, which helps when a
shopper logs in on the checkout page itself. See [Checkout](/guide/checkout).

## Arabic and English

Cart lines carry both locales at once:

```ts
for (const line of cart.lines) {
  const name = locale === 'ar' ? line.name_ar : line.name_en
}
```

That is different from the catalog, where the server resolves one locale from `Accept-Language` and
sends a single `name`. The cart holds both so a line rendered from a stored cart does not depend on
which locale the shopper was in when they added it.

## In Nuxt

`useCart()` keeps the cart in shared state, so a badge in the header and a line list on the page
cannot disagree. Every mutation writes the response into that state.

```vue
<script setup lang="ts">
const { cart, lines, itemCount, subtotal, isEmpty, hasUnpurchasableLines, addLine, updateLine, removeLine, refresh } = useCart()

await refresh()
</script>
```

`useCustomerAuth()` merges the guest cart after login by default. See
[Composables → useCart](/nuxt/composables#usecart).
