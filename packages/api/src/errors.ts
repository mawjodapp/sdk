/**
 * Mawjod answers failures with `application/problem+json` (RFC 7807) and adds two fields the
 * client is expected to use: `code` and `request_id`.
 *
 * Branch on `code`, never on `detail`. `detail` is prose written for a person and is reworded
 * without notice.
 */
export interface ProblemDocument {
  type?: string
  title?: string
  status: number
  detail?: string
  instance?: string
  code: string
  request_id?: string
  /** Present on 422 responses. */
  errors?: Record<string, string[]>
  /** Present on some 409 codes, e.g. `pricing_conflict` -> `reason: "expired"`. */
  reason?: string
  /** Present on `deployment_not_ready` (503) from the platform health endpoint. */
  checks?: Record<string, boolean>
  [key: string]: unknown
}

/** The three checkout failures that mean "the world moved under the buyer". */
export type StaleCartErrorCode =
  | 'cart_price_changed'
  | 'cart_not_purchasable'
  | 'insufficient_stock'

/**
 * The complete checkout failure family, source-verified against
 * `App\Modules\Order\Exceptions\CheckoutFailed`.
 */
export type CheckoutErrorCode =
  | StaleCartErrorCode
  | 'cart_empty'
  | 'cart_not_found'
  | 'payment_method_unavailable'
  | 'customer_not_verified'

/**
 * Documented `code` values. Left open with `(string & {})` on purpose: the server may introduce a
 * new code at any time and a client that crashes on one is worse than a client that falls through
 * to a generic message.
 */
export type MawjodErrorCode =
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

/** A problem+json failure returned by the API. */
export class MawjodApiError extends Error {
  override readonly name = 'MawjodApiError'

  /** HTTP status, taken from the problem document (which always mirrors the response status). */
  readonly status: number

  /** The machine-readable key. This is the only field worth branching on. */
  readonly code: MawjodErrorCode

  readonly title: string | undefined
  readonly detail: string | undefined

  /** Quote this when reporting a failure; it matches the `X-Request-ID` response header. */
  readonly requestId: string | undefined

  /** Field errors, present on 422. */
  readonly errors: Record<string, string[]> | undefined

  /** The untouched problem document, for codes this SDK does not model. */
  readonly problem: ProblemDocument

  constructor(problem: ProblemDocument) {
    super(
      problem.title === undefined
        ? `${problem.code} (${problem.status})`
        : `${problem.code} (${problem.status}): ${problem.title}`,
    )
    this.status = problem.status
    this.code = problem.code
    this.title = problem.title
    this.detail = problem.detail
    this.requestId = problem.request_id
    this.errors = problem.errors
    this.problem = problem
  }
}

/**
 * A failure that never reached the problem+json contract: the network was unreachable, the body
 * was not JSON, or `/sanctum/csrf-cookie` answered something other than 204.
 *
 * That endpoint sits outside `/api/v1` and carries no `code` or `request_id`, so a non-204 there
 * is a transport failure. Retry the CSRF call, not the write that triggered it.
 */
export class MawjodNetworkError extends Error {
  override readonly name = 'MawjodNetworkError'
  readonly url: string | undefined
  readonly status: number | undefined

  constructor(message: string, options: { url?: string; status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.url = options.url
    this.status = options.status
  }
}

/** What kind of payload failed its own invariant. */
export type PayloadIntegrityResource = 'order' | 'return' | 'search_hit'

/**
 * A well-formed 200 that cannot be true.
 *
 * An order or a return is created from at least one line, so an empty `lines` array is a lost
 * payload rather than an empty state. Rendering it would show a buyer an order that appears to
 * contain nothing, with a 200 status and a valid body, and nothing downstream could tell.
 *
 * A search hit with an empty `slug` is the same kind of failure wearing different clothes: the
 * shape typechecks and the content is hollow, so the row renders as a product nobody can open.
 */
export class PayloadIntegrityError extends Error {
  override readonly name = 'PayloadIntegrityError'
  readonly resource: PayloadIntegrityResource
  readonly resourceId: string | null
  readonly requestId: string | undefined

  constructor(
    resource: PayloadIntegrityResource,
    resourceId: string | null,
    requestId: string | undefined,
  ) {
    super(
      `${describe(resource)} ` +
        `resource_id=${resourceId ?? 'unknown'} request_id=${requestId ?? 'unknown'}`,
    )
    this.resource = resource
    this.resourceId = resourceId
    this.requestId = requestId
  }
}

function describe(resource: PayloadIntegrityResource): string {
  if (resource === 'search_hit') {
    return (
      'The API returned a search hit with an empty slug, which cannot happen. ' +
      'Treat this as a lost projection, not a product without an address.'
    )
  }

  return (
    `The API returned an ${resource} with no lines, which cannot happen. ` +
    `Treat this as a lost payload, not an empty ${resource}.`
  )
}

const STALE_CART_CODES: ReadonlySet<string> = new Set([
  'cart_price_changed',
  'cart_not_purchasable',
  'insufficient_stock',
])

const CHECKOUT_CODES: ReadonlySet<string> = new Set([
  'cart_price_changed',
  'cart_not_purchasable',
  'insufficient_stock',
  'cart_empty',
  'cart_not_found',
  'payment_method_unavailable',
  'customer_not_verified',
])

export function isMawjodApiError(error: unknown): error is MawjodApiError {
  return error instanceof MawjodApiError
}

export function isMawjodNetworkError(error: unknown): error is MawjodNetworkError {
  return error instanceof MawjodNetworkError
}

export function isPayloadIntegrityError(error: unknown): error is PayloadIntegrityError {
  return error instanceof PayloadIntegrityError
}

/** `validation_failed` (422). Read `error.errors` for the per-field messages. */
export function isValidationError(error: unknown): error is MawjodApiError {
  return isMawjodApiError(error) && error.code === 'validation_failed'
}

/** `unauthenticated` (401). The session cookie is missing or expired; send the caller to sign in. */
export function isUnauthenticated(error: unknown): error is MawjodApiError {
  return isMawjodApiError(error) && error.code === 'unauthenticated'
}

/** `forbidden` (403). Signed in, but not allowed to do this. */
export function isForbidden(error: unknown): error is MawjodApiError {
  return isMawjodApiError(error) && error.code === 'forbidden'
}

/**
 * `store_unavailable` (503). Possible on every endpoint: the shop is paused, the request was
 * refused before it reached the endpoint, and there is nothing to retry. Render one "shop paused"
 * screen rather than a per-call error.
 */
export function isStoreUnavailable(error: unknown): error is MawjodApiError {
  return isMawjodApiError(error) && error.code === 'store_unavailable'
}

/** Any member of the checkout failure family. */
export function isCheckoutError(
  error: unknown,
): error is MawjodApiError & { code: CheckoutErrorCode } {
  return isMawjodApiError(error) && CHECKOUT_CODES.has(error.code)
}

/**
 * The subset of checkout failures that mean the cart no longer matches what the buyer was shown.
 * Refetch the cart, show what changed, and ask the buyer to confirm. Do not retry silently.
 */
export function isStaleCartError(
  error: unknown,
): error is MawjodApiError & { code: StaleCartErrorCode } {
  return isMawjodApiError(error) && STALE_CART_CODES.has(error.code)
}
