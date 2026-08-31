import type { CartTokenStorage, MawjodClient } from '@mawjod/api'
import type { Ref } from 'vue'

import { useMawjodLocaleState, useMawjodNuxtApp } from '../internal'

/**
 * The raw `@mawjod/api` client for this Nuxt app instance.
 *
 * Every other composable is a thin wrapper over it. When one of them does not fit, reach for this
 * and `useAsyncData` directly. That is the intended escape hatch, not a workaround.
 */
export function useMawjodApi(): MawjodClient {
  const client = useMawjodNuxtApp().$mawjod

  if (client === undefined) {
    throw new Error(
      '[@mawjod/nuxt] No Mawjod client on this Nuxt app. The module plugin has not run. Check ' +
        'that `@mawjod/nuxt` is in `modules` in nuxt.config.',
    )
  }

  return client
}

/**
 * The `Accept-Language` sent with every call, as a writable ref.
 *
 * The module does not depend on `@nuxtjs/i18n`. A theme that uses it wires the two together itself:
 *
 * ```ts
 * const { locale } = useI18n()
 * const mawjodLocale = useMawjodLocale()
 * watch(locale, (next) => { mawjodLocale.value = next }, { immediate: true })
 * ```
 *
 * `null` means "send no header and let the API choose". It starts at the module's `locale` option.
 */
export function useMawjodLocale(): Ref<string | null> {
  return useMawjodLocaleState()
}

/**
 * Where the guest cart token is kept for this app instance: `localStorage` in the browser,
 * in-memory on the server.
 */
export function useMawjodCartTokenStorage(): CartTokenStorage {
  const storage = useMawjodNuxtApp().$mawjodCartTokenStorage

  if (storage === undefined) {
    throw new Error(
      '[@mawjod/nuxt] No cart token storage on this Nuxt app. The module plugin has not run.',
    )
  }

  return storage
}
