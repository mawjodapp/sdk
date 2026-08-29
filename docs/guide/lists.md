# Lists and search

Most collections in the API share one contract: bracketed pagination, a `sort` string, and a
`filter` object. Search does not: it takes flat parameters and refuses `filter` outright. The
client serializes both through one function, so the difference shows up in the input type rather
than in your code.

## The paginated envelope

```ts
interface Paginated<T> {
  data: T[]
  links: { first: string | null; last: string | null; prev: string | null; next: string | null }
  meta: {
    request_id: string
    current_page: number
    per_page: number
    last_page: number
    total: number
  }
}
```

`meta.total` is the count after filtering, not the size of the whole collection. A filtered list
showing "12 of 340" should read `meta.total`, not a separate unfiltered count.

## Pagination

```ts
await mawjod.catalog.products.list({ page: { number: 2, size: 24 } })
// ?page[number]=2&page[size]=24
```

`page[size]` maxes out at 100 and defaults to 20. Both parts are optional.

Search is the exception:

```ts
await mawjod.search.products({ q: 'ميزان', page: 2, per_page: 24 })
// ?q=…&page=2&per_page=24
```

`per_page` there runs 1 to 60, default 20; `page` runs 1 to 100.

## Sorting

```ts
await mawjod.catalog.products.list({ sort: '-published_at' })
await mawjod.orders.list({ sort: ['-placed_at', 'number'] })
// ?sort=-placed_at,number
```

A `-` prefix sorts descending. An array is joined with commas in order. The server appends an `id`
tie-breaker of its own, so pages never repeat or skip a row.

| Endpoint | Accepted sort keys |
| --- | --- |
| `catalog.products.list` | `published_at`, `created_at` |
| `catalog.categories.list`, `catalog.brands.list` | `created_at` only |
| `orders.list` | `placed_at`, `number` |
| `returns.list` | newest-first is the documented behaviour; no alternate keys are sampled |

The category and brand listings are the strict case. `sort=name` there is a `422`, because a name
only exists inside a locale, and the SDK types `sort` as `'created_at' | '-created_at'` so the name
form cannot be written. Order those two by name client-side, with `localeCompare` in the locale you
are rendering. See [`catalog`](/api/catalog#sorting-by-name-is-not-a-thing).

## Filters

`filter` takes three shapes, and the serializer picks the right one from the value:

```ts
await mawjod.orders.list({
  filter: {
    status: ['placed', 'confirmed'],           // a set  -> filter[status]=placed,confirmed
    placed_at: { from: '2026-01-01', to: '2026-03-31' }, // a range -> filter[placed_at][from], [to]
    q: 'nour',                                 // a scalar -> filter[q]=nour
  },
})
```

- Sets are comma-joined. An unknown value in a set is `422`, not an empty result, so validate the
  values your UI offers against the documented list.
- Ranges are inclusive. A bare date means the whole day in the store's timezone, so
  `to: '2026-03-31'` includes everything on the 31st.
- Any filter key the endpoint does not accept is `422`. There is no "ignored parameter" behaviour on
  a list that takes filters at all.
- The category and brand listings take none, and they are the one place where a filter is currently
  swallowed rather than refused. The SDK has no `filter` key on their query type, so you cannot send
  one through it, and you should not send one by hand either: that seam may tighten to a `422`.

`null`, `undefined` and empty strings are dropped rather than sent. That is deliberate: the API
answers `422` for a blank `filter[q]`, and "the user cleared the search box" should not become a
validation error.

### What each list accepts

| List | Filters |
| --- | --- |
| `catalog.products.list` | `category` (slug), `brand` (slug) |
| `catalog.categories.list`, `catalog.brands.list` | none |
| `orders.list` | `status` (set of `placed`, `confirmed`, `completed`, `cancelled`), `placed_at` (range), `number` (exact), `q` (free text) |
| `returns.list` | `status` (set of `requested`, `approved`, `rejected`, `cancelled`, `received`, `accepted`, `refused`), `requested_at` (range), `order_id`, `number` (exact), `q` (free text) |

`catalog.products` filters by slug, not by id. A slug is the same string in every locale, so one
filter value narrows both readings of the list.

## Search is a different contract

`GET /search/products` does not accept `filter` at all. Sending `filter[...]`, `store_id`,
`published` or `in_stock` is a `422`, not an ignored parameter: the public index is already scoped
to published, in-stock, current-store.

Its parameters are flat:

```ts
await mawjod.search.products({
  q: 'kitchen scale',
  category_id: '0195f3…',   // a UUID, not a slug
  brand_id: '0195f4…',
  min_price_minor: 5000,
  max_price_minor: 30000,
  page: 1,
  per_page: 24,
})
```

| Contrast | Catalog | Search |
| --- | --- | --- |
| Pagination | `page[number]`, `page[size]` (max 100) | `page`, `per_page` (max 60) |
| Category / brand | `filter[category]`, `filter[brand]` by slug | `category_id`, `brand_id` by UUID |
| Price range | not supported | `min_price_minor`, `max_price_minor` |
| Free text | not supported | `q`, up to 120 characters |
| `filter` | required for narrowing | **prohibited** |
| Result item | `ProductSummary`, one locale | `SearchProductHit`, both names |
| Extra `meta` | none | `engine`, `exhaustive_total`, `facets` |

The two are not interchangeable. Catalog is the browse surface: it has categories, brands and a
stable sort. Search is the query surface: typo-tolerant, both languages, and an exact SKU or
barcode ranks first.

Both sets of values come from one place. `catalog.categories.list()` and `catalog.brands.list()`
return every category and brand that has a visible product behind it, and each row carries both the
`slug` that catalog filters want and the `id` that search wants. There is no need to page through
products to work out what exists. See [`catalog`](/api/catalog#catalog-categories-list).

### Search metadata

```ts
const results = await mawjod.search.products({ q: 'ميزان' })

results.meta.engine           // 'meilisearch', or a Postgres fallback value
results.meta.exhaustive_total // false when meta.total is an estimate
results.meta.facets           // [{ field, values: [{ value, count }] }]
```

When the search engine is down the API falls back to Postgres and says so through `meta.engine`
rather than failing. `503 search_unavailable` is the last resort, and rare. If your UI shows "about
N results", read `exhaustive_total` to decide whether to say "about".

## Lists that are not paginated

Two collections come back as a bare `data: []` with no `links` and no page `meta`, because their
size is bounded:

```ts
const addresses = await mawjod.customer.addresses.list()   // Address[]
const locations = await mawjod.fulfillment.pickupLocations() // PickupLocation[]
```

The client types them as plain arrays, so you cannot accidentally reach for `.data`.

## Arabic and English

Where the locale is resolved differs by endpoint, and it matters for what you render.

Catalog resolves server-side. `Accept-Language`, set once through the client's `locale` option,
decides which name you get. The response tells you which one it picked:

```ts
const product = await mawjod.catalog.products.get(slug)

product.locale   // 'ar' or 'en'
product.name     // one string
product.slug     // the same string in either locale
product.category // { id, locale, name, slug }
```

Slugs are outside that resolution. A product, category or brand has one slug, so a URL built from it
resolves under `Accept-Language: ar` and under `en` alike and a shared link survives a language
switch. If your routes carry a locale prefix, that prefix is about which language the page renders
in, not about which slug to use.

Names are what search returns twice. The index stores both languages side by side and does not
resolve one:

```ts
for (const hit of results.data) {
  const name = locale === 'ar' ? hit.name_ar : hit.name_en
  const href = `/products/${hit.slug}`
}
```

Cart, order and return lines return both, so a stored line renders correctly regardless of which
locale the shopper was in when they added it: `name_ar` and `name_en` on `CartLine`, `OrderLine` and
`ReturnLine`.

Pickup locations return both: `name_ar`, `name_en`, `collection_instructions_ar`,
`collection_instructions_en`. Administrative areas the same: `name_ar`, `name_en` on
`AdministrativeArea` and on `AdministrativeAreaRef`.

### RTL

Nothing in the API is direction-aware; that is your theme's job. Set `dir` from the locale you are
sending:

```vue
<script setup lang="ts">
const locale = useMawjodLocale()
</script>

<template>
  <div :dir="locale === 'ar' ? 'rtl' : 'ltr'" :lang="locale ?? 'en'">
    <slot />
  </div>
</template>
```

Prices need care in RTL: `formatMoney(price, 'ar-EG')` already places the currency symbol correctly,
so do not wrap it in anything that forces LTR. See [Money → Arabic numerals](/guide/money#arabic-numerals).

## In Nuxt

```vue
<script setup lang="ts">
const page = ref(1)

const { data, refresh } = await useProducts(() => ({
  page: { number: page.value, size: 24 },
  filter: { category: route.params.slug as string },
}))
</script>
```

`useProducts`, `useOrders` and `useReturns` accept a ref or a getter and refetch when it changes.
The `useAsyncData` key is derived from the query's initial shape, so two lists on one page do not
collide while one list keeps its key across navigations. See
[Composables](/nuxt/composables#useproducts).
