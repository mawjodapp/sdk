import {
  type CartTokenStorage,
  createMawjodClient,
  isStoreUnavailable,
  type MawjodApiError,
  type MawjodClient,
} from '@mawjod/api'

export interface CreateNuxtMawjodClientOptions {
  /** Origin of the Mawjod deployment. */
  apiBase: string

  /**
   * Resolved once per request, so a locale switch takes effect without rebuilding the client.
   * `null` / `undefined` / `''` means "send no `Accept-Language`".
   */
  locale?: () => string | null | undefined

  /**
   * Headers forwarded on every call. Server-side this carries the incoming `cookie`, which is the
   * only way the Sanctum session and the `XSRF-TOKEN` reach the API during SSR. Client-side the
   * browser attaches cookies itself and this stays empty.
   */
  forwardHeaders?: Record<string, string>

  /** Where the guest cart token lives. */
  cartTokenStorage?: CartTokenStorage

  /** Called when any call fails with `store_unavailable` (503). */
  onStoreUnavailable?: (error: MawjodApiError) => void
}

/**
 * Builds the `@mawjod/api` client the way a Nuxt app needs it.
 *
 * Kept apart from the plugin so it can be exercised without a Nuxt runtime, and so the plugin
 * stays a thin reader of `runtimeConfig` and request state.
 */
export function createNuxtMawjodClient(options: CreateNuxtMawjodClientOptions): MawjodClient {
  const forwarded = options.forwardHeaders

  return createMawjodClient({
    baseUrl: options.apiBase,

    // A function, not a static object: it runs per request, which is what lets `useMawjodLocale()`
    // change the locale after the client was built.
    headers: () => {
      const headers: Record<string, string> = { ...forwarded }
      const locale = options.locale?.()

      if (locale !== null && locale !== undefined && locale !== '') {
        headers['Accept-Language'] = locale
      }

      return headers
    },

    ...(options.cartTokenStorage === undefined ? {} : { cartTokenStorage: options.cartTokenStorage }),

    onError: (error) => {
      if (isStoreUnavailable(error)) {
        options.onStoreUnavailable?.(error)
      }
    },
  })
}
