# Errors

Every failure that reaches the API's contract is an RFC 7807 `application/problem+json` document.
Everything else (a dead network, a proxy's HTML error page, a non-`204` from the CSRF endpoint) is
a transport failure and gets a different class.

## Three error classes

```ts
import {
  MawjodApiError,        // a problem+json failure from the API
  MawjodNetworkError,    // never reached the contract
  PayloadIntegrityError, // a well-formed 200 that cannot be true
} from '@mawjod/api'
```

### `MawjodApiError`

```ts
error.status     // number — mirrors the HTTP status
error.code       // string — the machine-readable key. Branch on this.
error.title      // string | undefined
error.detail     // string | undefined — prose for a person
error.requestId  // string | undefined — matches the X-Request-ID response header
error.errors     // Record<string, string[]> | undefined — present on 422
error.problem    // the untouched problem document, for codes the SDK does not model
```

### `MawjodNetworkError`

```ts
error.url     // string | undefined
error.status  // number | undefined — present when there was a response, just not a usable one
error.cause   // the underlying failure, when there was one
```

It is thrown when the request could not be sent, when the response body is not JSON, when a
non-`2xx` carries no `code`, when an envelope is missing its `data`, and when
`/sanctum/csrf-cookie` answers anything but `204`.

### `PayloadIntegrityError`

```ts
error.resource    // 'order' | 'return' | 'search_hit'
error.resourceId  // string | null
error.requestId   // string | undefined
```

See [the integrity guard](#the-integrity-guard) below.

## Branch on `code`, never on `detail`

`detail` is prose written for a person. It is reworded without notice, and it deliberately omits
the specifics: no quantities, no prices, no addresses. Matching on it will break, quietly, on a
copy edit.

```ts
// Wrong
if (error.detail?.includes('stock')) { … }

// Right
if (error.code === 'insufficient_stock') { … }
```

`code` is the contract. Even so, treat the set as open: the type is
`MawjodErrorCode = 'unauthenticated' | … | (string & {})`, so the known codes autocomplete while an
unrecognized one still typechecks. A client that crashes on a new code is worse than one that falls
through to a generic message.

## Type guards

```ts
import {
  isMawjodApiError,
  isMawjodNetworkError,
  isPayloadIntegrityError,
  isValidationError,
  isUnauthenticated,
  isForbidden,
  isStoreUnavailable,
  isCheckoutError,
  isStaleCartError,
} from '@mawjod/api'
```

| Guard | Matches |
| --- | --- |
| `isMawjodApiError` | any problem+json failure |
| `isMawjodNetworkError` | any transport failure |
| `isPayloadIntegrityError` | the empty-lines guard |
| `isValidationError` | `validation_failed` (422) |
| `isUnauthenticated` | `unauthenticated` (401) |
| `isForbidden` | `forbidden` (403) |
| `isStoreUnavailable` | `store_unavailable` (503) |
| `isCheckoutError` | the seven checkout codes |
| `isStaleCartError` | the three stale-cart codes |

They narrow, so TypeScript knows what you have:

```ts
try {
  await mawjod.customer.addresses.create(input)
} catch (error) {
  if (isValidationError(error)) {
    // error.errors is Record<string, string[]>
    for (const [field, messages] of Object.entries(error.errors ?? {})) {
      setFieldError(field, messages[0])
    }

    return
  }

  throw error
}
```

## Validation errors

`422 validation_failed` carries `errors`, keyed by field name, with an array of messages per field.
Field names use the API's own naming (`recipient_phone`, `lines.0.quantity`,
`position.longitude`), so a form that maps them straight through needs its inputs named the same
way.

One `422` catches people out: an `Accept-Language` the API does not accept produces
`errors.accept_language`. The API takes `ar` and `en`.

Some 422s are not validation failures at all: `cart_empty`, `outside_service_area`,
`identity_unavailable`, `invalid_identity_challenge`, `evidence_not_an_image` and
`payment_method_unavailable` all arrive as 422 with their own `code`. Check the code before assuming
`errors` is populated.

## `store_unavailable` is possible everywhere

`503 store_unavailable` means the shop is paused. The request was refused before it reached the
endpoint, so it can come back from any call, a catalog read as much as a checkout. There is
nothing to retry and no per-call recovery.

Render one screen for it, at the app level:

```ts
const mawjod = createMawjodClient({
  baseUrl,
  onError: (error) => {
    if (isStoreUnavailable(error)) {
      shopPaused.value = true
    }
  },
})
```

`onError` is called with every problem+json failure before it is thrown. It does not swallow the
error; your `catch` still runs.

In Nuxt this is already wired: `useStoreAvailability()` exposes a flag that any failing call flips.
See [Composables → useStoreAvailability](/nuxt/composables#usestoreavailability).

## The integrity guard

An order or a return is created from at least one line. The server never makes one without. So
`lines: []` on an order or a return is not an empty state. It is a payload that lost its lines
somewhere between the database and your screen, arriving as a well-formed `200`.

Rendering it shows a buyer an order that appears to contain nothing, with a valid body, and nothing
downstream can tell. The client refuses:

```ts
import { isPayloadIntegrityError } from '@mawjod/api'

try {
  const order = await mawjod.orders.get(orderId)
} catch (error) {
  if (isPayloadIntegrityError(error)) {
    // error.requestId is the thing to put in the bug report
    reportIncident(error.requestId)
    showSomethingWentWrong()

    return
  }

  throw error
}
```

The guard runs on `orders.get`, `orders.list`, `orders.cancel`, `checkout.place`, `returns.get`,
`returns.list`, `returns.create` and `returns.cancel`. On a list, one bad row throws for the whole
page: a page that silently drops the broken row is worse, because nobody finds out.

### Search hits are guarded the same way

`search.products` runs the same guard over every hit, on `slug`. A hit is only useful because it
can be followed, and the slug is the whole address, so `slug: ''` is a lost projection rather than
a product that happens to have no address. The shape typechecks either way, which is exactly why
nothing downstream would catch it: the row renders, and every link on it goes nowhere.

`error.resource` is `'search_hit'` and `error.resourceId` is the hit's `id`. One unlinkable hit
throws for the whole results page, for the same reason a list does.

## Known codes

| Code | Status | Where |
| --- | --- | --- |
| `unauthenticated` | 401 | any authenticated endpoint |
| `forbidden` | 403 | any authenticated endpoint |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere |
| `store_unavailable` | 503 | everywhere |
| `not_found` | 404 | product detail; likely on other by-id reads |
| `variant_not_purchasable` | 409 | `cart.addLine` |
| `pricing_conflict` | 409 | `cart.applyCoupon` |
| `cart_price_changed` | 409 | `checkout.place` |
| `cart_not_purchasable` | 409 | `checkout.place` |
| `insufficient_stock` | 409 | `checkout.place` |
| `cart_empty` | 422 | `checkout.place` |
| `cart_not_found` | 422 | `checkout.place` |
| `payment_method_unavailable` | 422 | `checkout.place` |
| `customer_not_verified` | 403 | `checkout.place` |
| `outside_service_area` | 422 | `fulfillment.quotes` |
| `identity_unavailable` | 422 | `auth.register` |
| `invalid_identity_challenge` | 422 | `auth.verify`, `auth.resetPassword` |
| `cancellation_window_closed` | 409 | `orders.cancel` |
| `payment_already_resolved` | 409 | `orders.pay` |
| `payment_provider_unavailable` | 503 | `orders.pay` |
| `return_window_closed` | 409 | `returns.create` |
| `return_transition_not_allowed` | 409 | `returns.cancel` |
| `evidence_not_an_image` | 422 | `returns.addEvidence` |
| `search_unavailable` | 503 | `search.products` |
| `deployment_not_ready` | 503 | `platform.health.ready` |

::: info About 404
Only product detail documents an explicit `404` example. The other by-id reads (an address, an
order, a return, a piece of evidence) use route-model binding scoped to the signed-in customer, so
a foreign or missing id very likely produces a `404` too; it just is not sampled in the generated
docs. Handle `not_found` on those reads; do not rely on its absence.
:::

## Reporting a failure

`requestId` matches the `X-Request-ID` response header and appears on both the success envelope's
`meta.request_id` and the error body's `request_id`. Put it in every bug report and every log line:

```ts
catch (error) {
  if (isMawjodApiError(error)) {
    logger.error('mawjod call failed', {
      code: error.code,
      status: error.status,
      requestId: error.requestId,
    })
  }
}
```
