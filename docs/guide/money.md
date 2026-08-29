# Money

Every price in the API is an integer number of minor units plus a currency. There are no floats
anywhere, and there is no field you can print directly.

```ts
interface Money {
  minor: number
  currency: string
  tax_inclusive: boolean
}
```

```json
{ "minor": 12500, "currency": "EGP", "tax_inclusive": true }
```

That is 125.00 EGP, or 12500 piastres.

`tax_inclusive` is `true` throughout this deployment. It is carried anyway because the server states
it rather than leaving it implied, and a theme that shows "incl. VAT" should read it rather than
hardcode it.

## `formatMoney`

```ts
formatMoney(money: Money, locale?: string, options?: Intl.NumberFormatOptions): string
```

```ts
import { formatMoney } from '@mawjod/api'

formatMoney({ minor: 12500, currency: 'EGP', tax_inclusive: true }, 'en-EG')
// 'EGP 125.00'

formatMoney({ minor: 12500, currency: 'EGP', tax_inclusive: true }, 'ar-EG')
// '‏١٢٥٫٠٠ ج.م.‏'
```

The divisor comes from the currency itself, via `Intl.NumberFormat`, not from a hardcoded 100. EGP
has two minor digits, JPY has none, KWD has three. Getting that wrong is a factor-of-1000 pricing
bug, which is why the helper exists at all.

`options` styles the output only. It is spread into `Intl.NumberFormat` after `style` and
`currency`, and never changes how minor units are converted:

```ts
formatMoney(price, 'en-EG', { currencyDisplay: 'narrowSymbol' })
formatMoney(price, 'en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
```

Omitting `locale` uses the runtime's default. In a browser that is the user's; on a server it is
whatever the process was started with, which is rarely what you want. Pass one explicitly in SSR
code.

## Never do arithmetic in major units

```ts
// Wrong. 0.1 + 0.2 is not 0.3, and the API does not want your rounding.
const total = price.minor / 100 + fee.minor / 100

// Right. Integers all the way, convert once at the edge.
const total = { ...price, minor: price.minor + fee.minor }

formatMoney(total, 'en-EG')
```

The same rule applies to anything you send. `expected_items_subtotal_minor` on checkout,
`subtotal_minor` on a fulfillment quote, and `min_price_minor` / `max_price_minor` on search are all
minor-unit integers.

```ts
const shipping = await mawjod.fulfillment.quotes({
  method: 'delivery',
  subtotal_minor: quote.discounted_subtotal.minor,
  address_id,
})
```

## Where `Money` appears

| Field | On |
| --- | --- |
| `from_price` | `ProductSummary`, `Product`, `SearchProductHit` |
| `price` | `Variant` |
| `subtotal`, `unit_price`, `line_total` | `Cart`, `CartLine` |
| `subtotal`, `discount_total`, `discounted_subtotal`, `tax_amount` | `CartQuote` |
| `gross`, `discount`, `net` | `QuotedLine` |
| `amount` | `AppliedDiscount`, `Payment`, `Refund`, `OrderDiscountAllocation` |
| `items_subtotal`, `discount_total`, `delivery_fee`, `total`, `tax_amount` | `OrderTotals` |
| `unit_price`, `line_total` | `OrderLine` |
| `subtotal`, `fee`, `minimum_order`, `free_threshold` | `FulfillmentQuote` |
| `unit`, `requested`, `accepted` | `ReturnLineRefundable` |
| `requested`, `accepted` | `ReturnRefundable` |

`FulfillmentQuote.free_threshold` is `Money | null`, and it is `null` when the store has no
free-delivery threshold. `ReturnRefundable.accepted` and `ReturnLineRefundable.accepted` are `null`
until a person has inspected the returned goods.

## Tax rates

Tax rates are basis points, not percentages:

```ts
quote.tax_rate_basis_points // 1400

const percent = quote.tax_rate_basis_points / 100 // 14
```

It appears on `CartQuote` and on `OrderTotals`.

## Arabic numerals

`formatMoney` follows the locale you give it, so `ar-EG` produces Eastern Arabic numerals and the
symbol on the correct side. If your theme renders Latin digits in Arabic (a common house style),
pass an explicit numbering system:

```ts
formatMoney(price, 'ar-EG-u-nu-latn')
```

Do not solve it by formatting with `en-EG` inside an Arabic page: that gets the digits right and the
currency placement wrong.
