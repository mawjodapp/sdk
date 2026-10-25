import { defaultCartTokenStorage, memoryCartTokenStorage } from '@mawjod/api'
import { defineNuxtPlugin, useRequestHeaders, useRequestURL } from '#imports'

import { createNuxtMawjodClient } from './create-client'
import { useMawjodLocaleState, useMawjodPublicConfig, useStoreAvailabilityState } from './internal'

/**
 * One `@mawjod/api` client per Nuxt app instance: per request on the server, per page load in the
 * browser. Never a module-scope singleton, because on the server that would share one visitor's
 * forwarded cookies with the next visitor's request.
 */
export default defineNuxtPlugin({
  name: 'mawjod',
  setup(nuxtApp) {
    const config = useMawjodPublicConfig()
    const locale = useMawjodLocaleState()
    const availability = useStoreAvailabilityState()

    // `ssrContext` exists only while rendering on the server.
    const server = Boolean(nuxtApp.ssrContext)

    // SSR has no cookie jar, so the incoming `cookie` header is the only carrier of the Sanctum
    // session and the `XSRF-TOKEN` the client echoes on writes. In the browser this is unnecessary:
    // `credentials: 'include'` already sends them.
    //
    // Sanctum reads that cookie only on a request whose `Referer` or `Origin` names a stateful
    // domain, which a browser sends and a server render does not. Without it every SSR read is
    // answered as signed out, so a refresh on a signed-in page bounced to the login page. The page's
    // own origin is what the browser would have sent.
    const forwardHeaders = server
      ? { ...(useRequestHeaders(['cookie']) as Record<string, string>), referer: `${useRequestURL().origin}/` }
      : undefined

    // A guest cart token written during SSR would be per-request and unreachable from the browser
    // afterwards, so the server gets in-memory storage: guest cart writes during SSR are not a
    // supported path. In the browser the token belongs in `localStorage` so it survives reloads.
    const cartTokenStorage = server ? memoryCartTokenStorage() : defaultCartTokenStorage()

    const client = createNuxtMawjodClient({
      apiBase: config.apiBase,
      locale: () => locale.value,
      cartTokenStorage,
      ...(forwardHeaders === undefined ? {} : { forwardHeaders }),
      onStoreUnavailable: (error) => {
        availability.value = {
          available: false,
          detail: error.detail ?? null,
          requestId: error.requestId ?? null,
        }
      },
    })

    return {
      provide: {
        mawjod: client,
        // Exposed so `useCustomerAuth()` can tell whether a guest cart exists before it tries to
        // merge one. Use `useMawjodApi()` for everything else.
        mawjodCartTokenStorage: cartTokenStorage,
      },
    }
  },
})
