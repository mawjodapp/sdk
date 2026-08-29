# Getting started

`@mawjod/api` is a TypeScript client for the Mawjod storefront API. It has no runtime dependencies
and uses the platform's `fetch`, so it runs in a browser, in Node 20 or newer, and in any edge
runtime that provides `fetch` and Web Crypto.

If you are building with Nuxt, install [`@mawjod/nuxt`](/nuxt/installation) instead. It brings the
client with it and wires up the parts that are fiddly to do by hand.

## Install

```sh
pnpm add @mawjod/api
```

## Create a client

```ts
// lib/mawjod.ts
import { createMawjodClient } from '@mawjod/api'

export const mawjod = createMawjodClient({
  baseUrl: 'http://localhost:8000',
})
```

`baseUrl` is the origin of the deployment, without the `/api/v1` prefix. The client adds that. It
is required and there is no default; `createMawjodClient` throws if it is missing or empty. There is
no canonical Mawjod domain to fall back on, and one deployment serves exactly one store, so the
origin is the only thing that identifies which shop you are talking to.

## Client options

```ts
createMawjodClient(options: MawjodClientOptions): MawjodClient
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `baseUrl` | `string` | — | Required. Origin of the deployment, e.g. `http://localhost:8000`. |
| `fetch` | `typeof fetch` | the platform's | Override the fetch implementation. |
| `headers` | `HeadersInit \| (() => HeadersInit \| Promise<HeadersInit>)` | none | Extra headers on every request. Pass a function to compute them per request; that is how an SSR consumer forwards the incoming `Cookie`. |
| `locale` | `'ar' \| 'en' \| string` | none | Sent as `Accept-Language`. A per-call header wins over it. |
| `onError` | `(error: MawjodApiError) => void` | none | Called with every problem+json failure before it is thrown. It does not swallow the error. |
| `cartTokenStorage` | `CartTokenStorage` | `localStorage` in a browser, in-memory elsewhere | Where the guest cart token lives. See [Cart](/guide/cart#storage-adapters). |

The returned client has one property per namespace: `store`, `catalog`, `search`, `cart`, `auth`,
`customer`, `checkout`, `orders`, `returns`, `fulfillment`, `platform`.

## Your first catalog call

```ts
import { formatMoney } from '@mawjod/api'
import { mawjod } from './lib/mawjod'

const page = await mawjod.catalog.products.list({
  page: { number: 1, size: 12 },
  sort: '-published_at',
})

for (const product of page.data) {
  console.log(product.name, formatMoney(product.from_price, 'en-EG'))
}

console.log(`${page.data.length} of ${page.meta.total}`)
```

Every list returns the same envelope: `data`, `links`, and a `meta` that carries the page numbers
plus a `request_id`. See [Lists and search](/guide/lists).

Product detail is addressed by slug, not by id:

```ts
const product = await mawjod.catalog.products.get('kitchen-scale')

console.log(product.description)
console.log(product.variants.map((variant) => variant.sku))
```

## Prices are minor units

`from_price` is not a number you can print. It is a `Money`:

```ts
{ minor: 12500, currency: 'EGP', tax_inclusive: true }
```

12500 piastres, not 12500 pounds. Use `formatMoney` and never divide by 100 yourself. See
[Money](/guide/money).

## Locale

The `locale` option sets `Accept-Language` on every request. The API accepts `ar` and `en` and
answers `422 validation_failed` for anything else.

```ts
const mawjod = createMawjodClient({
  baseUrl: 'http://localhost:8000',
  locale: 'ar',
})
```

Most catalog fields come back already resolved to that locale: a `Product` carries one `name` and a
`locale` field saying which one you got. Its `slug` is not locale-dependent at all, so the same
product URL answers in both languages. Search is the exception: it returns `name_ar` and `name_en`
side by side, because the index stores both. Cart lines, order lines and pickup locations also carry
both. [Lists and search](/guide/lists#arabic-and-english) covers where each shape applies.

## Writes, sessions and CSRF

Reads work with no setup. The first write (adding a cart line, logging in, placing an order) needs
a CSRF token, and the client fetches one for you before it sends the request. Identity is a
session cookie, so every request goes out with `credentials: 'include'`.

That means the browser has to consider your storefront and the API same-site, which is a
configuration matter on the API side. [Authentication](/guide/authentication) walks through it,
including the two settings that break local development most often.

## The Nuxt variant

```sh
pnpm add @mawjod/nuxt
```

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

The same catalog call, in a page:

```vue
<script setup lang="ts">
const { data: page } = await useProducts({ page: { size: 12 }, sort: '-published_at' })
</script>

<template>
  <ul>
    <li v-for="product in page?.data ?? []" :key="product.id">
      {{ product.name }}
    </li>
  </ul>
</template>
```

`useProducts` is auto-imported, wraps `useAsyncData`, and runs during SSR. The module gives every
request its own client so one visitor's forwarded cookies never reach another's render. See
[Configuration](/nuxt/configuration) and [Composables](/nuxt/composables).

## Where to go next

- [Building a theme](/guide/building-a-theme): a minimal storefront, page by page.
- [Cart](/guide/cart): the guest token you get exactly once.
- [Checkout](/guide/checkout): the idempotency pair and the failure families.
- [Errors](/guide/errors): what to branch on, and what never to parse.
