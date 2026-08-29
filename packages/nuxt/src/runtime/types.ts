/**
 * Shared runtime types. They live under `runtime/` so both the module (build-time) and the
 * composables (run-time) can reference them without a cross-boundary import in the wrong direction.
 */

/** The shape the module writes to `runtimeConfig.public.mawjod`. */
export interface MawjodPublicRuntimeConfig {
  /**
   * Origin of the Mawjod deployment, e.g. `https://shop.example.com`.
   *
   * Overridable at boot with `NUXT_PUBLIC_MAWJOD_API_BASE`.
   */
  apiBase: string

  /**
   * Default `Accept-Language`. An empty string means "send none and let the API choose".
   *
   * Overridable at boot with `NUXT_PUBLIC_MAWJOD_LOCALE`. It is a starting value: `useMawjodLocale()`
   * can change it at any time, which is how an i18n-driven theme switches locale per navigation.
   */
  locale: string
}

/**
 * The slice of `useAsyncData` options this module forwards.
 *
 * It is deliberately narrow. Anything richer is one line away: `useMawjodApi()` hands you the raw
 * client, and `useAsyncData` is yours to call directly.
 */
export interface MawjodAsyncOptions {
  /** Run the fetch during SSR. Default `true`. */
  server?: boolean
  /** Do not block navigation on the fetch. Default `false`. */
  lazy?: boolean
  /** Fetch immediately. Default `true`; pass `false` to fetch only when you call `refresh()`. */
  immediate?: boolean
  /** What to do when a second fetch starts while one is in flight. */
  dedupe?: 'cancel' | 'defer'
}

/** What `useStoreAvailability()` keeps, kept plain so it survives the SSR payload. */
export interface StoreAvailabilityState {
  /** `false` once any call has failed with `store_unavailable` (503). */
  available: boolean
  /** The problem document's `detail`, when the API sent one. */
  detail: string | null
  /** The request id to quote when reporting the outage. */
  requestId: string | null
}

/** The idempotency pair a checkout attempt must reuse across retries. */
export interface CheckoutAttempt {
  /** Sent as the `Idempotency-Key` header. */
  idempotencyKey: string
  /** Sent as the `operation_id` body field; doubles as the stock-reservation identity. */
  operationId: string
}
