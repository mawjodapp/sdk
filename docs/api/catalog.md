# `catalog`

The browse surface: a paginated product list, product detail by slug, and the category and brand
listings a nav is built from. All four are unauthenticated and pre-scoped to the published
catalogue.

For free-text queries use [`search`](/api/search) instead. The two have different contracts and are
not interchangeable.

```ts
mawjod.catalog.products.list(query?)
mawjod.catalog.products.get(slug)
mawjod.catalog.categories.list(query?)
mawjod.catalog.brands.list(query?)
```

## `catalog.products.list()`

```ts
list(query?: CatalogProductsQuery): Promise<Paginated<ProductSummary>>
```

`GET /api/v1/catalog/products`.

```ts
const page = await mawjod.catalog.products.list({
  page: { number: 1, size: 24 },
  sort: '-published_at',
  filter: { category: 'kitchen' },
})
```

### `CatalogProductsQuery`

```ts
type CatalogProductsQuery = {
  page?: { number?: number | null; size?: number | null }
  sort?: string | string[] | null
  filter?: {
    category?: string | null
    brand?: string | null
  }
}
```

| Field | Notes |
| --- | --- |
| `page.number` | ≥ 1, default 1 |
| `page.size` | 1–100, default 20 |
| `sort` | `published_at` or `created_at`, optionally `-` prefixed. An array joins with commas. |
| `filter.category` | An active category **slug** |
| `filter.brand` | An active brand **slug** |

Any other `filter` key is `422 validation_failed`, not an ignored parameter.

Slugs do not vary by locale. One category has one slug, so the same filter value narrows the list
whichever `Accept-Language` you are sending, and a filtered URL can be shared across languages.

`null` and empty-string values are dropped before the request goes out, so clearing a filter in your
UI does not become a validation error.

### `ProductSummary`

```ts
interface ProductSummary {
  id: string
  locale: string            // which locale the server resolved
  slug: string
  name: string
  category: Category        // { id, locale, name, slug }
  brand: Brand              // { id, locale, name, slug }
  from_price: Money         // the cheapest variant's price
  image: Image | null       // the lead image, or null when the product has none
  variants_count: number
  published_at: string | null
}
```

The list carries `variants_count`, not the variants themselves. Fetch the detail when you need them.

`image` is the one picture a product card needs, so a list renders without a second request. It is
`null` for a product nobody has uploaded a photo for, which is a normal state rather than an error.
See [Images](#images) for the shape and for how to build a `srcset` from it.

The `category` and `brand` nested here are the plain four-field shapes. Neither carries an image;
only the taxonomy listings do.

## `catalog.products.get()`

```ts
get(slug: string): Promise<Product>
```

`GET /api/v1/catalog/products/{slug}`. Public product detail is addressed by slug, not by id. A
product has one slug and it answers under every locale. The client URL-encodes it for you, so a slug
written in Arabic works as-is.

```ts
const product = await mawjod.catalog.products.get('ميزان-مطبخ')
```

### `Product`

```ts
interface Product extends ProductSummary {
  description: string | null
  images: Image[]
  variants: Variant[]
  attributes: ProductAttribute[]
}

interface Variant {
  id: string
  sku: string
  barcode: string | null
  price: Money
  images: Image[]
  available: boolean
}
```

`variant.id` is what `cart.addLine` takes. `available: false` means it cannot be added; adding it
anyway is `409 variant_not_purchasable`.

A `Variant` carries no display label in release one. There is no `name`, no `title`, and no option
map, so nothing on this shape says "500ml" or "large". A picker has to derive its labels from
`price`, or from a vendor's SKU convention, or from the product's `attributes`. The gap is reported
to the backend. See
[Building a theme → product page](/guide/building-a-theme#product-page).

A slug no published product in this store answers to is `404 not_found`.

### Images on a product

`images` is every picture on the product, in order. The `image` the detail inherits from
`ProductSummary` is `images[0]`, the same asset rather than a separate one, so a gallery reads
`images` and ignores `image`. An empty array means the product has no pictures, and `image` is
`null` in the same breath.

`variant.images` is always an array too. It is never `null` and never missing, and empty is the
ordinary case: most stores photograph the product rather than each variant. Show the variant's own
pictures when the selected variant has some, and fall back to the product's otherwise.

```ts
const gallery = selected.images.length > 0 ? selected.images : product.images
```

### Attributes

```ts
interface ProductAttribute {
  key: string
  name: string
  type: string
  value: string | number | boolean | null
}
```

```json
{ "key": "fabric", "name": "Fabric", "type": "option", "value": "cotton" }
```

Only the detail carries these. A `ProductSummary` has no `attributes`, so a product card cannot
show specs and a list cannot be filtered on them client-side.

`key` is the stable identifier to match on. `name` is the display label and follows the requested
language like the rest of the catalog, so never derive a label from `key`.

`type` says how to render the value: `option`, `text`, `number` and `boolean` exist today. Treat it
as open. A type added later must not break a theme written now, so branch on the ones you handle
and let anything else fall through to plain text.

`value` is a string, a number, a boolean, or `null`. A boolean attribute comes back as a JSON
`true` or `false`, not `"true"` and not `1`, because the server canonicalizes through the column's
type before storing. No coercion is needed on this side.

A specs table is the usual rendering:

```ts
const specs = product.attributes.filter((attribute) => attribute.value !== null)
```

## Images

One shape covers every picture the catalog returns.

```ts
interface Image {
  id: string
  url: string                                  // the original
  alt: string | null
  renditions: Record<string, ImageRendition>
}

interface ImageRendition {
  url: string
  width: number
  height: number
}
```

`url` on the `Image` is the original upload. It has no `width` or `height`, deliberately:
dimensions belong to a rendition, which is the thing a layout actually sizes. The original is the
largest asset available and the safe `src`.

`renditions` is an open map keyed by rendition name. `thumbnail`, `medium` and `large` are the
sizes generated today. Read it as data:

- A missing key means that size has not been generated yet, not that something went wrong. Handle
  the short map instead of treating it as a failure.
- A key you have not seen before is a size added later, and it must not break the page. Iterate the
  keys you are given rather than reading three you assumed were there.
- The exact set of sizes is not part of the contract, so do not branch on one being present.

Read every rendition url off the rendition object. Never build one by rewriting the original's url.
How a rendition is named and where it is stored is a server implementation detail, and a url you
derived today breaks the day that detail changes.

`alt` is the localized alternative text, following the requested language with the same fallback as
the rest of the catalog. It is `null` when nobody wrote one, so give an `<img>` something else to
say: the product name is usually the right fallback.

### `imageSrcSet`

```ts
imageSrcSet(image: Image): { src: string; srcset: string }
```

::: info Renditions are empty in release one
There is no image encoder yet, so every public image arrives with `renditions: {}`. The media
processor publishes rendition urls only when the processor behind them reports that it produces
renderable images, and the release-one one says it does not, so the map is empty rather than full of
urls that are not pictures.

An empty map is the documented "not generated yet" case, not a failure, and this helper already
handles it: you get the original url and an empty `srcset`, which browsers ignore. Binding the
helper today renders the original and nothing else. When a real encoder ships the map repopulates,
`srcset` starts listing sizes, and a theme that already binds the helper becomes responsive without
a code change.
:::

Builds the two attributes an `<img>` wants. `src` is the original url, which is always present.
`srcset` lists each rendition as `url width`, sorted narrowest first, over whatever keys the image
carries. An image with no renditions gets an empty `srcset`, which browsers ignore, and the
original still renders.

```ts
import { imageSrcSet } from '@mawjod/api'

const { src, srcset } = imageSrcSet(product.image)
// src    -> 'https://cdn.example/original.jpg'
// srcset -> 'https://cdn.example/thumb.jpg 200w, https://cdn.example/large.jpg 1200w'
```

```vue
<img
  v-if="product.image"
  v-bind="imageSrcSet(product.image)"
  sizes="(max-width: 600px) 50vw, 300px"
  :alt="product.image.alt ?? product.name"
>
```

`sizes` is yours to write: only the layout knows how wide the image renders.

## `catalog.categories.list()`

```ts
list(query?: CatalogTaxonomyQuery): Promise<Paginated<CategoryListItem>>
```

`GET /api/v1/catalog/categories`. Public and unauthenticated, like the product list.
`Accept-Language` picks the locale, with the same fallback as the rest of the catalog.

```ts
const categories = await mawjod.catalog.categories.list({ page: { size: 100 } })
```

### `CatalogTaxonomyQuery`

One query type serves both listings.

```ts
type CatalogTaxonomyQuery = {
  page?: { number?: number | null; size?: number | null } | null
  sort?: 'created_at' | '-created_at' | null
}
```

| Field | Notes |
| --- | --- |
| `page.number` | ≥ 1, default 1 |
| `page.size` | 1–100, default 20 |
| `sort` | `created_at` or `-created_at`. There is no other key. |

### Sorting by name is not a thing

`sort=name` is `422 validation_failed`, and the SDK type refuses to express it: `sort` is
`'created_at' | '-created_at'`, so the name form cannot be written in the first place.

The reason is that a name only exists inside a locale. A server-side sort by name would have to
pick one collation and apply it to every reading of the list, which is the wrong answer for at
least one of the two locales.

Order by name yourself, in the locale you are rendering. That is the intended pattern for a nav:

```ts
const { data } = await mawjod.catalog.categories.list({ page: { size: 100 } })

const nav = [...data].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
```

`localeCompare` with the rendering locale puts an Arabic nav in Arabic order and an English one in
English order, which one server sort could never do for both.

### There are no filters

Neither listing takes a filter. `CatalogTaxonomyQuery` has no `filter` key at all, so the SDK will
not let you send one.

The server accepts and ignores `filter[…]` here today. Treat that as a loose seam rather than a
feature: it may tighten to `422 validation_failed` later. Do not send one.

This is the opposite of [`catalog.products.list()`](#catalog-products-list), where an unrecognised
filter key is a 422 already.

### Empty categories are hidden

Every entry in this listing has at least one visible product behind it. The listing uses exactly
the same visibility predicate as the public product list, so any `slug` you get back, passed as
`filter[category]` to `catalog.products.list()`, returns at least one product. A nav entry built
from this list can never lead to an empty page.

::: info A category can be absent, by design
A category a vendor created but has not published any products into is not in this listing. It is
not missing: it is visible on the staff side, where the vendor manages it, and it appears here as
soon as a product lands in it. Archiving the last product empties a category back out of the
listing without the category itself being touched.
:::

### `Category` and `CategoryListItem`

```ts
interface Category {
  id: string
  locale: string
  name: string
  slug: string
}

interface CategoryListItem extends Category {
  image: Image | null
}
```

`Category` is the shape the product list nests under `product.category`. `slug` is ready to pass
straight back as `filter[category]`, and it is the same string whichever locale you read the list
in, so only `name` changes between an Arabic reading and an English one. `id` is the UUID that
[`search`](/api/search) takes as `category_id`.

This listing returns `CategoryListItem`, which adds an `image`. See [Images](#images) for the
shape. `null` means the category has no picture, which a nav should expect: build the tile so it
reads without one.

::: warning Only the listing rows carry an image
The `category` embedded in a `ProductSummary` is a plain `Category` and never has an `image`. That
is why they are two types instead of one type with an optional field: an optional `image` would
autocomplete on a product card and be `undefined` every single time.

A card that wants a category picture has to read it from this listing and match on `id` or `slug`.
:::

## `catalog.brands.list()`

```ts
list(query?: CatalogTaxonomyQuery): Promise<Paginated<BrandListItem>>
```

`GET /api/v1/catalog/brands`.

```ts
const brands = await mawjod.catalog.brands.list({ sort: 'created_at' })
```

```ts
interface Brand {
  id: string
  locale: string
  name: string
  slug: string
}

interface BrandListItem extends Brand {
  image: Image | null
}
```

Everything above applies unchanged: the same query type, `created_at` sort only, no filters, and
only brands with at least one visible product behind them. The image split is the same too. Rows
from this listing carry one, a `product.brand` never does, and `null` is the normal answer for a
brand with no logo uploaded.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `not_found` | 404 | `products.get` |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere |
| `store_unavailable` | 503 | everywhere |

## In Nuxt

```ts
const { data: page } = await useProducts(() => ({ page: { number: page.value } }))
const { data: product } = await useProduct(() => route.params.slug as string)
const { data: categories } = await useCategories({ page: { size: 100 } })
const { data: brands } = await useBrands()
```

Each accepts a ref or a getter and refetches when it changes. See
[Composables → useProducts](/nuxt/composables#useproducts) and
[Composables → useCategories](/nuxt/composables#usecategories).
