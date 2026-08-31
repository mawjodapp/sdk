# `search`

Full-text, typo-tolerant product search across Arabic and English. Unauthenticated.

```ts
mawjod.search.products(query?)
```

## `search.products()`

```ts
products(query?: SearchProductsQuery): Promise<SearchResults<SearchProductHit>>
```

`GET /api/v1/search/products`.

```ts
const results = await mawjod.search.products({ q: 'ميزان', per_page: 24 })
```

### `SearchProductsQuery`

```ts
type SearchProductsQuery = {
  q?: string
  category_id?: string
  brand_id?: string
  min_price_minor?: number
  max_price_minor?: number
  page?: number
  per_page?: number
}
```

| Field | Notes |
| --- | --- |
| `q` | Arabic or English, up to 120 characters. An exact SKU or barcode ranks first. |
| `category_id` | A **UUID**, not a slug |
| `brand_id` | A **UUID**, not a slug |
| `min_price_minor` | 0 to 1,000,000,000, in minor units |
| `max_price_minor` | 0 to 1,000,000,000, in minor units |
| `page` | 1 to 100 |
| `per_page` | 1 to 60, default 20 |

The UUIDs for `category_id` and `brand_id` come from
[`catalog.categories.list()`](/api/catalog#catalog-categories-list) and
[`catalog.brands.list()`](/api/catalog#catalog-brands-list); `id` on each row is the value to send.
A filter sidebar does not have to reconstruct the set from hits or facets.

::: danger `filter` is prohibited
Search does not accept `filter[…]` at all. Neither does it accept `store_id`, `published` or
`in_stock`. Sending any of them is `422 validation_failed`, not an ignored parameter: the public
index is already scoped to published, in-stock, current-store.

This is the opposite of [`catalog`](/api/catalog), which requires `filter` to narrow. Do not copy a
query object from one to the other.
:::

Pagination is flat here (`page` and `per_page`), where every other list takes `page[number]` and
`page[size]`. The client's query serializer handles both; the difference shows up in the input type.

### `SearchProductHit`

```ts
interface SearchProductHit {
  id: string
  sku: string | null
  barcode: string | null
  name_ar: string
  name_en: string
  slug: string
  brand: SearchTaxonomyRef    // { id: string | null, name: string }
  category: SearchTaxonomyRef
  from_price: Money
}
```

A hit is deliberately not a `ProductSummary`. The search index stores both names side by side and
does not resolve one, so you pick:

```ts
for (const hit of results.data) {
  const name = locale === 'ar' ? hit.name_ar : hit.name_en
  const href = `/products/${hit.slug}`
}
```

`slug` is not one of the paired fields. A product has a single slug that reads the same under `ar`
and `en`, so the link above resolves whichever locale the shopper is in.

::: warning An empty slug throws
Every hit on the page is checked for a non-empty `slug` before the results resolve. A hit is only
useful because it can be followed, so `slug: ''` is a lost projection rather than a product without
an address: the shape typechecks, the row renders, and every link on it goes nowhere.

The client throws `PayloadIntegrityError` with `resource: 'search_hit'`, the hit's `id` as
`resourceId`, and the response's `request_id`. One bad hit throws for the whole page, the same
stance the order and return lists take. See
[Errors → the integrity guard](/guide/errors#the-integrity-guard).
:::

A hit carries no `variants` and no `description`. Follow the slug into
[`catalog.products.get`](/api/catalog#catalog-products-get) for detail.

### Hits carry no image

There is no `image` on a `SearchProductHit` this release, and no other picture field either. The
catalog exposes images and search does not.

So a results page has two honest options. Render results as text, which is what a typeahead and a
compact result list want anyway. Or, when the design needs pictures, fetch catalog summaries for
the slugs on the visible page only and render from those:
[`catalog.products.list`](/api/catalog#catalog-products-list) rows carry
[`image`](/api/catalog#images). Do not fetch the whole result set to decorate it.

### `SearchResults`

```ts
interface SearchResults<T> {
  data: T[]
  links: PaginationLinks
  meta: SearchMeta
}

interface SearchMeta extends PaginationMeta {
  engine: string             // 'meilisearch', or a Postgres fallback value
  exhaustive_total: boolean
  facets: SearchFacet[]      // [{ field, values: [{ value, count }] }]
}
```

`engine` tells you which backend answered. When the search engine is down the API falls back to
Postgres and reports it here rather than failing, so a changed `engine` value is a degradation
signal, not an error.

`exhaustive_total` is `false` when `meta.total` is an estimate. If your UI says "N results", read
this to decide whether to say "about N".

`facets` are counts per field value, ready for a filter sidebar. The `field` names come from the
index; treat the array as data rather than assuming which fields are present.

## Errors

| Code | Status | Notes |
| --- | --- | --- |
| `validation_failed` | 422 | Including a prohibited field |
| `rate_limited` | 429 | |
| `search_unavailable` | 503 | Last resort; the Postgres fallback usually prevents it |
| `store_unavailable` | 503 | |

## In Nuxt

```ts
const { query, hits, meta, search, reset, pending } = useProductSearch({ per_page: 24 })

await search({ q: term.value })
```

`useProductSearch` is invoked rather than fetched on setup, because search is a user action, not
page data.

::: warning Its state is shared per app instance
Two search widgets on the same page share one query and one result set. That is intended for the
single-search-page case. If you need two independent searches, call `useMawjodApi().search.products()`
directly and hold the results yourself.
:::

See [Composables → useProductSearch](/nuxt/composables#useproductsearch).
