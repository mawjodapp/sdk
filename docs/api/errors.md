# Errors

Reference for the three error classes, the guards, and the problem document. For how to use them,
see [Errors](/guide/errors) in the guide.

```ts
import {
  MawjodApiError,
  MawjodNetworkError,
  PayloadIntegrityError,
  isMawjodApiError,
  isMawjodNetworkError,
  isPayloadIntegrityError,
  isValidationError,
  isUnauthenticated,
  isForbidden,
  isStoreUnavailable,
  isCheckoutError,
  isStaleCartError,
  type CheckoutErrorCode,
  type MawjodErrorCode,
  type ProblemDocument,
  type StaleCartErrorCode,
} from '@mawjod/api'
```

## `MawjodApiError`

A problem+json failure returned by the API.

```ts
class MawjodApiError extends Error {
  readonly name: 'MawjodApiError'
  readonly status: number
  readonly code: MawjodErrorCode
  readonly title: string | undefined
  readonly detail: string | undefined
  readonly requestId: string | undefined
  readonly errors: Record<string, string[]> | undefined
  readonly problem: ProblemDocument
}
```

| Property | Notes |
| --- | --- |
| `status` | Taken from the problem document, which always mirrors the HTTP status |
| `code` | The machine-readable key. **The only field worth branching on.** |
| `title` | A human title |
| `detail` | Prose for a person. Reworded without notice; never parse it. |
| `requestId` | Matches the `X-Request-ID` response header. Quote it in bug reports. |
| `errors` | Field errors, present on 422 |
| `problem` | The untouched document, for codes the SDK does not model |

`message` is `"<code> (<status>)"`, or `"<code> (<status>): <title>"` when a title is present.

## `MawjodNetworkError`

A failure that never reached the problem+json contract.

```ts
class MawjodNetworkError extends Error {
  readonly name: 'MawjodNetworkError'
  readonly url: string | undefined
  readonly status: number | undefined
}
```

Thrown when:

- the request could not be sent at all (`cause` carries the underlying failure)
- the response body could not be read
- a `2xx` body is not JSON
- a non-`2xx` response carries no `code` (a proxy page, a gateway, an unhandled server fault)
- a success envelope is missing its `data`
- `/sanctum/csrf-cookie` answers anything other than `204`

That last one matters. The CSRF route sits outside `/api/v1`, does not speak problem+json, and
carries no `code` or `request_id`. Retry the CSRF call, not the write that triggered it.

## `PayloadIntegrityError`

A well-formed `200` that cannot be true.

```ts
class PayloadIntegrityError extends Error {
  readonly name: 'PayloadIntegrityError'
  readonly resource: PayloadIntegrityResource   // 'order' | 'return' | 'search_hit'
  readonly resourceId: string | null
  readonly requestId: string | undefined
}
```

An order or a return is created from at least one line, so `lines: []` is a lost payload rather than
an empty state. Thrown by `orders.list`, `orders.get`, `orders.cancel`, `checkout.place`,
`returns.list`, `returns.get`, `returns.create` and `returns.cancel`.

A search hit is only useful because it can be followed, and `slug` is the whole address, so
`slug: ''` is a lost projection rather than a product without an address. Thrown by
`search.products` with `resource: 'search_hit'` and the hit's `id` as `resourceId`.

On a list or a results page, one bad row throws for the whole page.

## Type guards

| Guard | Narrows to | Matches |
| --- | --- | --- |
| `isMawjodApiError(e)` | `MawjodApiError` | any problem+json failure |
| `isMawjodNetworkError(e)` | `MawjodNetworkError` | any transport failure |
| `isPayloadIntegrityError(e)` | `PayloadIntegrityError` | the empty-lines and empty-slug guards |
| `isValidationError(e)` | `MawjodApiError` | `code === 'validation_failed'` |
| `isUnauthenticated(e)` | `MawjodApiError` | `code === 'unauthenticated'` |
| `isForbidden(e)` | `MawjodApiError` | `code === 'forbidden'` |
| `isStoreUnavailable(e)` | `MawjodApiError` | `code === 'store_unavailable'` |
| `isCheckoutError(e)` | `MawjodApiError & { code: CheckoutErrorCode }` | the seven checkout codes |
| `isStaleCartError(e)` | `MawjodApiError & { code: StaleCartErrorCode }` | the three stale-cart codes |

## `ProblemDocument`

```ts
interface ProblemDocument {
  type?: string
  title?: string
  status: number
  detail?: string
  instance?: string
  code: string
  request_id?: string
  errors?: Record<string, string[]>   // present on 422
  reason?: string                     // present on some 409s, e.g. pricing_conflict -> 'expired'
  checks?: Record<string, boolean>    // present on deployment_not_ready
  [key: string]: unknown
}
```

The index signature is there because the API may add fields; reach through `error.problem` for
anything the class does not surface.

## Code types

```ts
type StaleCartErrorCode =
  | 'cart_price_changed'
  | 'cart_not_purchasable'
  | 'insufficient_stock'

type CheckoutErrorCode =
  | StaleCartErrorCode
  | 'cart_empty'
  | 'cart_not_found'
  | 'payment_method_unavailable'
  | 'customer_not_verified'

type MawjodErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation_failed'
  | 'store_unavailable'
  | 'rate_limited'
  | 'not_found'
  | CheckoutErrorCode
  | 'variant_not_purchasable'
  | 'pricing_conflict'
  | 'outside_service_area'
  | 'identity_unavailable'
  | 'invalid_identity_challenge'
  | 'cancellation_window_closed'
  | 'payment_already_resolved'
  | 'payment_provider_unavailable'
  | 'return_window_closed'
  | 'return_transition_not_allowed'
  | 'evidence_not_an_image'
  | 'search_unavailable'
  | 'deployment_not_ready'
  | (string & {})
```

`MawjodErrorCode` is deliberately open. The `(string & {})` member keeps autocomplete for the known
codes while letting an unrecognized one typecheck: the server may introduce a code at any time, and
a client that crashes on one is worse than a client that falls through to a generic message.

## `onError`

Every problem+json failure passes through the client's `onError` callback before it is thrown. It
does not swallow the error.

```ts
createMawjodClient({
  baseUrl,
  onError: (error) => {
    if (isStoreUnavailable(error)) {
      shopPaused.value = true
    }
  },
})
```

`MawjodNetworkError` and `PayloadIntegrityError` do not go through `onError`; it is typed for
`MawjodApiError` only.

## Status quick reference

| Status | Meaning here |
| --- | --- |
| 401 | `unauthenticated` (no session, or it expired) |
| 403 | `forbidden`, `customer_not_verified` |
| 404 | `not_found` |
| 409 | The world moved, or a window closed. Refetch. |
| 419 | CSRF mismatch. Handled internally: refresh once, replay once. |
| 422 | Validation, or a named refusal like `outside_service_area` |
| 429 | `rate_limited` |
| 503 | `store_unavailable`, `search_unavailable`, `payment_provider_unavailable`, `deployment_not_ready` |

You will never see a 419 as a thrown error unless a second one arrives after the retry, at which
point it is a real failure and not a race.
