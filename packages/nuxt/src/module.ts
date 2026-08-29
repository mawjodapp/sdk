import { addImportsDir, addPlugin, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'

import type { MawjodPublicRuntimeConfig } from './runtime/types'

export interface ModuleOptions {
  /**
   * Origin of the Mawjod deployment, e.g. `https://shop.example.com`.
   *
   * There is no store selector: one deployment serves exactly one store. Leave it empty here and
   * set `NUXT_PUBLIC_MAWJOD_API_BASE` if the origin differs per environment.
   */
  apiBase: string

  /**
   * Default `Accept-Language` for every call. The API accepts `ar` and `en` and answers
   * `422 validation_failed` for anything else; the type stays open so a deployment that gains a
   * locale does not need a new SDK release.
   *
   * This is only the starting value — `useMawjodLocale()` changes it at runtime.
   */
  locale?: 'ar' | 'en' | (string & {})
}

export type { MawjodPublicRuntimeConfig }

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@mawjod/nuxt',
    configKey: 'mawjod',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  defaults: {
    apiBase: '',
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const logger = useLogger('@mawjod/nuxt')

    const publicConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    const existing = (publicConfig['mawjod'] ?? {}) as Partial<MawjodPublicRuntimeConfig>

    // Both keys are always written, even when empty: Nuxt only applies a `NUXT_PUBLIC_…` override
    // to a key that already exists in the runtime config, with the type it already has.
    const resolved: MawjodPublicRuntimeConfig = {
      apiBase: existing.apiBase ?? options.apiBase ?? '',
      locale: existing.locale ?? options.locale ?? '',
    }

    publicConfig['mawjod'] = resolved

    if (resolved.apiBase === '') {
      logger.warn(
        'No `mawjod.apiBase` is configured. Set it in nuxt.config, or supply ' +
          '`NUXT_PUBLIC_MAWJOD_API_BASE` at boot — the client refuses to be built without one.',
      )
    }

    addPlugin(resolver.resolve('./runtime/plugin'))
    addImportsDir(resolver.resolve('./runtime/composables'))
  },
})
