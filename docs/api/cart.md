# `cart`

The shopper's cart. Reads need no authentication; writes need CSRF, which the client bootstraps on
its own. `merge` requires a signed-in customer.

Guest carts are identified by the `X-Mawjod-Cart-Token` header, not by the session cookie. The
client captures and replays that token for you. See [Cart](/guide/cart) for the whole story.

```ts
mawjod.cart.get()
mawjod.cart.quote()
mawjod.cart.addLine(input)
mawjod.cart.updateLine(lineId, quantity)
mawjod.cart.removeLine(lineId)
mawjod.cart.applyCoupon(code)
mawjod.cart.removeCoupon()
mawjod.cart.merge(guestToken?)
```

## `cart.get()`

```ts
get(): Promise<Cart>
```

`GET /api/v1/cart`. Reads the caller's cart with refreshed prices and availability.

```ts
const cart = await mawjod.cart.get()
```

`cart.id` is `null` when the caller has no cart yet. The API answers a zeroed cart rather than a
`404`, so "no cart" is a normal state and not an error to handle.

### `Cart`

```ts
interface Cart {
  id: string | null
  status: string                  // 'active'
  is_guest: boolean
  guest_token: string | null      // non-null exactly once, at creation
  item_count: number
  subtotal: Money
  has_unpurchasable_lines: boolean
  lines: CartLine[]
  adjustments: CartAdjustment[]
  last_activity_at: string | null
}

interface CartLine {
  id: string
  variant_id: string
  sku: string
  name_ar: string
  name_en: string
  option_selection: Record<string, unknown>  // reserved; always {} in release one
  quantity: number
  unit_price: Money
  line_total: Money
  purchasable: boolean
}
```

Lines carry both locales, unlike the catalog which resolves one server-side. A stored line therefore
renders correctly whichever locale the shopper was in when they added it.

`subtotal` is the plain line total. Discounts and tax do not appear on `Cart`; they live on
[`cart.quote()`](#cart-quote).

## `cart.quote()`

```ts
quote(): Promise<CartQuote>
```

`GET /api/v1/cart/quote`. Reprices the cart and re-evaluates promotions. It does not mutate
anything.

```ts
interface CartQuote {
  subtotal: Money
  discount_total: Money
  discounted_subtotal: Money
  tax_amount: Money
  tax_rate_basis_points: number     // 1400 = 14%
  applied_discount: AppliedDiscount | null
  lines: QuotedLine[]               // [{ line_id, gross, discount, net }]
  rejected_discounts: RejectedDiscount[]
}

interface AppliedDiscount {
  discount_id: string
  name_ar: string
  name_en: string
  type: string
  scope: string
  coupon_code: string | null
  amount: Money
}
```

`discounted_subtotal.minor` is what checkout's `expected_items_subtotal_minor` guard wants, and what
a fulfillment quote's `subtotal_minor` wants.

`rejected_discounts` lists promotions that were evaluated and did not apply, each with a `reason`.

## `cart.addLine()`

```ts
addLine(input: AddCartLineInput): Promise<Cart>
```

`POST /api/v1/cart/lines`. Creates the cart when there is none.

```ts
interface AddCartLineInput {
  variant_id: string
  quantity: number                      // 1-999
  options?: Record<string, never>       // reserved; release one accepts only {}
}
```

Adding a variant that is already in the cart sums into the existing line rather than creating a
second one.

For a guest, this is the response that issues `guest_token`. The client stores it and sends it as
`X-Mawjod-Cart-Token` from here on. It is never issued again.

A variant that cannot be sold is `409 variant_not_purchasable`.

## `cart.updateLine()`

```ts
updateLine(lineId: string, quantity: number): Promise<Cart>
```

`PUT /api/v1/cart/lines/{lineId}`. Replaces the line's quantity (1 to 999). This is a replace, not a
delta.

## `cart.removeLine()`

```ts
removeLine(lineId: string): Promise<Cart>
```

`DELETE /api/v1/cart/lines/{lineId}`. Returns the cart without that line.

## `cart.applyCoupon()`

```ts
applyCoupon(code: string): Promise<CartQuote>
```

`POST /api/v1/cart/coupon`. The code is 3 to 40 characters and matched case-insensitively.

Returns a `CartQuote`, not a `Cart`.

Every refusal is one code, `409 pricing_conflict`, covering unknown, inactive, expired,
unqualified, fully redeemed, and beaten-by-a-better-promotion. The problem document may carry a
`reason` slug (`'expired'`, for instance), readable through `error.problem.reason`.

## `cart.removeCoupon()`

```ts
removeCoupon(): Promise<CartQuote>
```

`DELETE /api/v1/cart/coupon`. The returned quote has `applied_discount: null`.

## `cart.merge()`

```ts
merge(guestToken?: string): Promise<Cart>
```

`POST /api/v1/cart/merge`. Requires an authenticated customer.

Defaults to the stored guest token, so you usually call it with no arguments. It throws a plain
`Error` when no token was passed and none is stored: there is nothing to merge, which is a
programming mistake rather than an API failure.

```ts
const cart = await mawjod.cart.merge()

cart.is_guest    // false
cart.adjustments // [{ reason: 'merged_quantity_summed', line_id, variant_id,
                 //    previous_quantity, quantity }]
```

The merge is additive and deterministic: identical lines sum, guest-only lines move across, and
replaying the same token merges only once. On success the client clears the stored token.

::: info The token moves to the body here
Every other cart call carries the guest token in the `X-Mawjod-Cart-Token` header. This one takes it
in the request body as `guest_token`. The client handles the difference; it is documented because it
is visible in the network tab.
:::

[`checkout.place`](/api/checkout) can also merge inline, by taking `guest_token` in its own body.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `variant_not_purchasable` | 409 | `addLine` |
| `pricing_conflict` | 409 | `applyCoupon` |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere |
| `store_unavailable` | 503 | everywhere |

`merge` also requires authentication, so `401 unauthenticated` applies to it.

## In Nuxt

```ts
const { cart, lines, itemCount, subtotal, latestQuote, addLine, updateLine, removeLine } = useCart()
```

`useCart()` keeps the cart in shared state and writes every mutation's response into it. See
[Composables → useCart](/nuxt/composables#usecart).
