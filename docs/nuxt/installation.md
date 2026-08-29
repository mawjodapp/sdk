# Installation

`@mawjod/nuxt` is a Nuxt 4 module wrapping [`@mawjod/api`](/api/store). It gives every request its
own client, forwards cookies during SSR, and auto-imports a composable per resource.

It ships no UI components. Themes bring their own markup.

## Requirements

| | |
| --- | --- |
| Nuxt | 4.0 or newer (declared as a peer dependency) |
| Node | 20 or newer |

## Install

```sh
pnpm add @mawjod/nuxt
```

`@mawjod/api` comes with it as a dependency. Add it separately only if you also import from it
directly, which you will, for types and for `formatMoney`:

```sh
pnpm add @mawjod/api
```

## Installing from a sibling checkout

Until the packages are published, a theme installs them from a local clone of the SDK sitting next
to it. That takes three things, and skipping the third fails.

Build the SDK first. Both packages resolve to `dist/`, which is not committed, so a fresh clone has
nothing for the consumer to link against:

```sh
cd ../mawjod_sdk
pnpm install
pnpm build
```

Then declare both packages by path in the theme's `package.json`, and add a `pnpm.overrides` entry
for `@mawjod/api`:

```json
{
  "dependencies": {
    "@mawjod/api": "file:../mawjod_sdk/packages/api",
    "@mawjod/nuxt": "file:../mawjod_sdk/packages/nuxt"
  },
  "pnpm": {
    "overrides": {
      "@mawjod/api": "file:../mawjod_sdk/packages/api"
    }
  }
}
```

The override is the part that is easy to miss. `@mawjod/nuxt` depends on `@mawjod/api` as
`workspace:*`, a specifier that only resolves inside the SDK's own workspace. Installing the module
by `file:` from outside that workspace leaves the specifier unresolvable and `pnpm install` stops
with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. Pointing the override at the same `file:` path gives pnpm
something to resolve it to.

Paths are relative to the file they are written in. Rebuild the SDK after changing it: the link
points at `dist/`, not at the sources, so an unbuilt edit is invisible to the theme.

## Register the module

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@mawjod/nuxt'],
  mawjod: {
    apiBase: 'http://localhost:8000',
    locale: 'ar',
  },
})
```

`apiBase` is the origin of the deployment, without the `/api/v1` prefix.

::: danger An empty `apiBase` fails hard
The module logs a warning at build time when no `apiBase` is configured, and the plugin throws at
runtime when it tries to build a client without one. That is by design: a storefront pointed at
nothing should fail immediately and loudly, not render an empty catalogue that looks like an empty
store.

Set `mawjod.apiBase` in `nuxt.config`, or supply `NUXT_PUBLIC_MAWJOD_API_BASE` at boot. See
[Configuration](/nuxt/configuration).
:::

## First page

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
import { formatMoney } from '@mawjod/api'

const { data: store } = await useStoreInfo()
const { data: page } = await useProducts({ page: { size: 12 } })
</script>

<template>
  <main>
    <h1>{{ store?.name }}</h1>

    <ul>
      <li v-for="product in page?.data ?? []" :key="product.id">
        {{ product.name }} — {{ formatMoney(product.from_price, 'ar-EG') }}
      </li>
    </ul>
  </main>
</template>
```

Nothing is imported except the type-level helper. Every composable is auto-imported.

## What the module does

- Writes `runtimeConfig.public.mawjod = { apiBase, locale }`, so both keys can be overridden by
  environment variables at boot.
- Registers a plugin that builds one `@mawjod/api` client per Nuxt app instance: per request on the
  server, per page load in the browser. Never a module-scope singleton, which on the server would
  share one visitor's forwarded cookies with the next visitor's request.
- Forwards the incoming `cookie` header into the client during SSR.
- Uses in-memory cart-token storage on the server and `localStorage` in the browser.
- Wires the client's `onError` to a shared store-availability flag, so any `store_unavailable`
  failure anywhere flips one screen.
- Auto-imports every composable in `runtime/composables`.

## Development

The API and your Nuxt dev server are different origins, and Sanctum's session cookie only works when
the deployment considers your origin stateful. That is two environment variables on the API side,
and getting either wrong produces failures that look like bugs in the theme. See
[Authentication → development setup](/guide/authentication#development-setup).

A combination that works locally:

```
API                        http://localhost:8000
Nuxt                       http://localhost:3000
SANCTUM_STATEFUL_DOMAINS   localhost:3000,localhost:8000
CORS_ALLOWED_ORIGINS       http://localhost:3000
```

Pick `localhost` or `127.0.0.1` and use it on both sides. They are different hosts to a browser, and
a cookie set for one never travels to the other.

## Next

- [Configuration](/nuxt/configuration): module options, runtime config, environment overrides.
- [Composables](/nuxt/composables): every composable, with signatures.
- [Building a theme](/guide/building-a-theme): a working storefront.
