# Configuration

## Module options

Set under the `mawjod` key in `nuxt.config.ts`.

```ts
export default defineNuxtConfig({
  modules: ['@mawjod/nuxt'],
  mawjod: {
    apiBase: 'http://localhost:8000',
    locale: 'ar',
  },
})
```

```ts
interface ModuleOptions {
  apiBase: string
  locale?: 'ar' | 'en' | (string & {})
}
```

### `apiBase`

Origin of the Mawjod deployment, without the `/api/v1` prefix. Required.

There is no store selector. One deployment serves exactly one store, so this is the only thing
identifying which shop the theme is talking to.

Leave it empty here and set `NUXT_PUBLIC_MAWJOD_API_BASE` if the origin differs per environment.

::: danger An empty `apiBase` fails hard
The module warns at build time; the plugin throws at runtime when it tries to build a client with an
empty base URL. That is deliberate: a storefront pointed at nothing should fail loudly rather than
render an empty catalogue that looks like an empty store.
:::

### `locale`

The starting value for `Accept-Language`. The API accepts `ar` and `en` and answers
`422 validation_failed` for anything else. The type stays open so a deployment that gains a locale
does not need an SDK release.

This is only a starting value. `useMawjodLocale()` changes it at runtime, which is how an i18n-driven
theme switches locale per navigation:

```vue
<script setup lang="ts">
const { locale } = useI18n()
const mawjodLocale = useMawjodLocale()

watch(locale, (next) => { mawjodLocale.value = next }, { immediate: true })
</script>
```

Setting it to `null` sends no `Accept-Language` and lets the API choose the store's default.

The module has no dependency on `@nuxtjs/i18n`. Wiring the two together is three lines and yours to
own.

## Runtime config

The module writes both keys into `runtimeConfig.public.mawjod`, always, even when empty:

```ts
interface MawjodPublicRuntimeConfig {
  apiBase: string
  locale: string   // '' means "send no Accept-Language"
}
```

Both keys are written unconditionally because Nuxt only applies a `NUXT_PUBLIC_…` override to a key
that already exists in the runtime config, with the type it already has. An absent key cannot be
overridden at boot.

A value already present in `runtimeConfig.public.mawjod` wins over the module option, so you can set
it there directly if you prefer:

```ts
export default defineNuxtConfig({
  modules: ['@mawjod/nuxt'],
  runtimeConfig: {
    public: {
      mawjod: {
        apiBase: 'http://localhost:8000',
        locale: 'ar',
      },
    },
  },
})
```

## Environment overrides

| Variable | Overrides |
| --- | --- |
| `NUXT_PUBLIC_MAWJOD_API_BASE` | `mawjod.apiBase` |
| `NUXT_PUBLIC_MAWJOD_LOCALE` | `mawjod.locale` |

```sh
NUXT_PUBLIC_MAWJOD_API_BASE=https://shop.example.com node .output/server/index.mjs
```

These are read at boot, not at build, so one build artefact can serve several environments.

They are public runtime config: the values are embedded in the client bundle and visible to
anyone. That is correct here, because the API origin is not a secret, and there are no secrets in
this module. Do not add any.

## Per-call overrides

The module's `locale` is a default for the client, not a rule for every call. A header supplied per
call wins over it, because the transport sets `Accept-Language` first and lets anything later
override it.

For anything the composables do not cover, reach for the raw client:

```ts
const api = useMawjodApi()
const { data } = await useAsyncData('platform', () => api.platform.info())
```

That is the intended escape hatch. `useMawjodApi()` returns the same `MawjodClient` the composables
use. See [`createMawjodClient` options](/guide/getting-started#client-options) for what the module
has already configured on it.

## What you cannot configure

| | Why |
| --- | --- |
| The store | One deployment, one store. There is no selector. |
| The `fetch` implementation | The plugin does not expose it. Build your own client if you need to swap it. |
| `onError` | Reserved by the module for the store-availability flag. Catch errors at your call sites. |
| Cart token storage | Chosen by environment: in-memory on the server, `localStorage` in the browser. |

If one of those matters, build a client yourself with `createMawjodClient` and provide it however
your app prefers. The module is a convenience, not a gate.

## State keys

The module's shared state uses stable, namespaced `useState` keys, so a theme can clear them by
name:

```ts
'mawjod:locale'
'mawjod:store-availability'
'mawjod:cart'
'mawjod:cart-quote'
'mawjod:customer'
```

```ts
clearNuxtState(['mawjod:cart', 'mawjod:cart-quote'])
```

Other composable state (in-flight flags, errors, the checkout attempt pair, search results) is
held per Nuxt app instance and deliberately never written to the SSR payload. See
[SSR](/nuxt/ssr#what-crosses-the-hydration-boundary).
