# `orders`

The signed-in customer's own orders: list, read, cancel, and start a payment session. Every call
requires an authenticated customer.

```ts
mawjod.orders.list(query?)
mawjod.orders.get(orderId)
mawjod.orders.cancel(orderId, input)
mawjod.orders.pay(orderId, input?)
```

## `orders.list()`

```ts
list(query?: OrdersQuery): Promise<Paginated<Order>>
```

`GET /api/v1/customer/orders`.

```ts
const page = await mawjod.orders.list({
  page: { size: 20 },
  sort: '-placed_at',
  filter: { status: ['placed', 'confirmed'] },
})
```

### `OrdersQuery`

```ts
type OrdersQuery = {
  page?: { number?: number | null; size?: number | null }
  sort?: string | string[] | null
  filter?: {
    status?: OrderStatus[] | OrderStatus
    placed_at?: { from?: string | number | boolean | null; to?: string | number | boolean | null }
    number?: string
    q?: string
  }
}

type OrderStatus = 'placed' | 'confirmed' | 'completed' | 'cancelled' | (string & {})
```

| Field | Notes |
| --- | --- |
| `sort` | `placed_at` or `number`, `-` prefixed for descending. The server appends an `id` tie-breaker. |
| `filter.status` | A set. Comma-joined. An unknown value is `422`, not an empty result. |
| `filter.placed_at` | Inclusive range. A bare date means the whole day in the store's timezone. |
| `filter.number` | Exact order number |
| `filter.q` | Free text over number, customer name, email and phone |

Any other `filter` key is `422`.

The list runs the payload integrity guard over every row, so one order with `lines: []` throws for
the whole page. A page that silently drops a broken row is worse, because nobody finds out.

## `orders.get()`

```ts
get(orderId: string): Promise<Order>
```

`GET /api/v1/customer/orders/{orderId}`.

Throws `PayloadIntegrityError` on an order with no lines. See
[Errors](/guide/errors#the-integrity-guard).

## `orders.cancel()`

```ts
cancel(orderId: string, input: CancelOrderInput): Promise<Order>
```

`POST /api/v1/customer/orders/{orderId}/cancel`.

```ts
interface CancelOrderInput {
  reason: string          // 3-500 characters, recorded in the order's history
  operation_id?: string   // UUIDv7; generated when omitted
}
```

```ts
const cancelled = await mawjod.orders.cancel(order.id, {
  reason: 'Ordered the wrong size',
})
```

Cancelling releases stock and fails an unsettled payment. A settled payment is left alone and
goes to the refund flow instead. See [`returns`](/api/returns).

The window closes once fulfillment starts processing. Past it, the call is
`409 cancellation_window_closed`. There is no endpoint that tells you whether the window is still
open, so the honest UI is to offer the button and handle the refusal.

Pass the same `operation_id` when retrying so the retry no-ops instead of racing.

## `orders.pay()`

```ts
pay(orderId: string, input?: PayOrderInput): Promise<PaymentSession>
```

`POST /api/v1/customer/orders/{orderId}/payment`. Starts or resumes a provider payment session.

```ts
interface PayOrderInput {
  operation_id?: string   // UUIDv7; generated when omitted
}

interface PaymentSession {
  type: string    // 'redirect'
  url: string
  reference: string
}
```

```ts
if (order.payment?.requires_action) {
  const session = await mawjod.orders.pay(order.id)

  window.location.assign(session.url)
}
```

Three things about this call:

- Ask the order, not the method. `payment.requires_action` is stated by the server. Inferring it
  from `payment.method` either strands a card buyer on an unpaid order or sends a cash buyer to a
  payment page that does not exist.
- The URL is single-use and short-lived, and is never persisted server-side. You cannot re-read
  it; start a new session instead.
- Nothing settles here. Only the provider's signed webhook marks a payment paid. Poll the order
  after the shopper returns rather than trusting the return URL.

Reusing the same `operation_id` resumes the existing provider session instead of opening a second
one.

An order whose payment is already resolved is `409 payment_already_resolved`. A provider outage is
`503 payment_provider_unavailable`.

## `Order`

```ts
interface Order {
  id: string
  number: string
  status: string
  placed_at: string
  customer: CustomerRef
  totals: OrderTotals
  fulfillment_method: 'delivery' | 'pickup'
  discount_allocations: OrderDiscountAllocation[]
  address: Record<string, unknown> | null
  quote: Record<string, unknown>
  lines: OrderLine[]                    // never empty
  payment: Payment | null
  fulfillment: OrderFulfillment | null
  history: OrderHistoryEntry[]
}
```

```ts
interface CustomerRef {
  id: string
  name: string
  phone: string
}

interface OrderTotals {
  items_subtotal: Money
  discount_total: Money
  delivery_fee: Money
  total: Money
  tax_amount: Money
  tax_rate_basis_points: number
}

interface OrderLine {
  id: string
  variant_id: string
  sku: string
  name_ar: string
  name_en: string
  option_selection: Record<string, unknown>
  quantity: number
  unit_price: Money        // frozen at placement
  line_total: Money
}

interface Payment {
  id: string
  method: string           // 'cod' | 'paymob' | …
  status: string
  amount: Money
  requires_action: boolean
  settled_at: string | null
  attempts: PaymentAttempt[]   // [{ outcome, driver, reason, occurred_at }]
}

interface OrderFulfillment {
  id: string
  method: 'delivery' | 'pickup'
  status: string
  eta: { minimum_minutes: number; maximum_minutes: number }
}

interface OrderHistoryEntry {
  from_status: string | null
  to_status: string
  actor_type: string
  reason: string | null
  occurred_at: string
}
```

::: warning Two fields have no pinned shape
`address` and `quote` are frozen JSON snapshots taken at placement. The API contract does not pin
their shape, so the SDK types them as `Record<string, unknown> | null` and
`Record<string, unknown>`. Read them defensively, or render the order from `totals`,
`fulfillment_method` and `lines` instead, which are pinned.
:::

`payment` and `fulfillment` are both nullable. A freshly placed order can carry `null` for either
while the server is still assembling them, so do not assume they are there on the confirmation
screen.

`unit_price` on a line is frozen at placement. The catalogue price may have moved since, and the
order is the record of what was agreed.

`customer` is the account the order belongs to. It is on every order read: the list, the detail,
the result of `cancel`, and the order that [`checkout`](/api/checkout) hands back. One server-side
resource serves both the staff and the customer views, which is why a shopper's own order still
names them. The same shape is embedded in a [`Return`](/api/returns#return).

Order lines carry both locales, like cart lines.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `cancellation_window_closed` | 409 | `cancel` |
| `payment_already_resolved` | 409 | `pay` |
| `payment_provider_unavailable` | 503 | `pay` |
| `unauthenticated` | 401 | everywhere |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere |
| `store_unavailable` | 503 | everywhere |

`PayloadIntegrityError` is thrown by `list`, `get` and `cancel`. It is not an API error; it is the
client refusing to hand you an order that cannot exist.

## In Nuxt

```ts
const { orders, page, get, cancel, pay, mutating } = useOrders(() => ({ filter: { status: 'placed' } }))
```

::: tip
`useOrders()` fetches the list on setup. Pass `{ immediate: false }` when a page only needs the
mutation methods:

```ts
const { cancel, pay } = useOrders(undefined, { immediate: false })
```
:::

See [Composables → useOrders](/nuxt/composables#useorders).
