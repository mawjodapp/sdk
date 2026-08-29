# Types

The shapes shared across namespaces. Everything is exported from `@mawjod/api`; there is no default
export.

Resource types specific to one namespace are documented on that namespace's page:
[`catalog`](/api/catalog), [`cart`](/api/cart), [`customer`](/api/customer),
[`orders`](/api/orders), [`returns`](/api/returns), [`fulfillment`](/api/fulfillment).

## `Money`

```ts
interface Money {
  minor: number
  currency: string
  tax_inclusive: boolean
}
```

Integer minor units plus a currency. Never a float, because a float cannot represent a piastre and
the API never sends one. `tax_inclusive` is `true` throughout this deployment; it is carried because the
server states it rather than leaving it implied.

Format with [`formatMoney`](#formatmoney). See [Money](/guide/money).

## Envelopes

Every success response is one of four shapes.

### Single resource

```ts
interface ApiMeta {
  request_id: string
}
```

The client unwraps `{ data, meta }` and hands you the `data`. `meta.request_id` matches the
`X-Request-ID` response header; it survives into `PayloadIntegrityError` where it matters, and is
otherwise not surfaced.

### Paginated collection

```ts
interface Paginated<T> {
  data: T[]
  links: PaginationLinks
  meta: PaginationMeta
}

interface PaginationLinks {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

interface PaginationMeta extends ApiMeta {
  current_page: number
  per_page: number
  last_page: number
  total: number
}
```

`total` is the count after filtering, not the size of the collection.

Returned by `catalog.products.list`, `orders.list` and `returns.list`.

### Search collection

```ts
interface SearchResults<T> {
  data: T[]
  links: PaginationLinks
  meta: SearchMeta
}

interface SearchMeta extends PaginationMeta {
  engine: string
  exhaustive_total: boolean
  facets: SearchFacet[]
}

interface SearchFacet {
  field: string
  values: { value: string; count: number }[]
}
```

Returned by `search.products` only. See [`search`](/api/search).

### Bare array

`customer.addresses.list()` and `fulfillment.pickupLocations()` return plain arrays. They are not
paginated, and the client types them as `T[]` so you cannot reach for `.data`.

## Small shared shapes

```ts
type StoreLocale = 'ar' | 'en'
type FulfillmentMethod = 'delivery' | 'pickup'
type CustomerIdentityType = 'email' | 'phone'

interface GeoPosition {
  longitude: number   // -180..180
  latitude: number    // -90..90
}

interface EtaWindow {
  minimum_minutes: number
  maximum_minutes: number
}

interface OperatingWindow {
  day: number      // 0 to 6
  opens: string    // "HH:MM"
  closes: string   // "HH:MM"
}

type AdministrativeAreaLevel = 'governorate' | 'city' | 'district'

interface AdministrativeAreaRef {
  id: string
  level: string
  code: string
  name_ar: string
  name_en: string
}

interface CustomerRef {
  id: string
  name: string
  phone: string
}
```

`AdministrativeAreaRef` is the area embedded in an address or a pickup location. The full row that
`customer.areas.list()` returns is `AdministrativeArea`, which adds `source`, `parent_id` and the
timestamps. See [`customer.areas.list`](/api/customer#customer-areas-list).

`CustomerRef` is the customer embedded in an [`Order`](/api/orders#order) and in a
[`Return`](/api/returns#return). It is three fields, not the profile: the full account is
`Customer`, which [`customer.profile.get()`](/api/customer#customer-profile-get) returns.

## Open unions

Three types are deliberately open, written as `'known' | 'values' | (string & {})`. Known values
autocomplete; an unrecognized one still typechecks, so a deployment that gains a value does not need
an SDK release.

```ts
type PaymentMethod = 'cod' | 'paymob' | (string & {})
type OrderStatus = 'placed' | 'confirmed' | 'completed' | 'cancelled' | (string & {})
type ReturnStatus =
  | 'requested' | 'approved' | 'rejected' | 'cancelled'
  | 'received' | 'accepted' | 'refused'
  | (string & {})
```

`MawjodErrorCode` is open for the same reason. See [Errors](/api/errors#code-types).

`ReturnReason` is not open. It is a closed enum the server validates:

```ts
type ReturnReason =
  | 'damaged' | 'wrong_item' | 'not_as_described'
  | 'missing_parts' | 'changed_mind' | 'other'
```

## Unpinned shapes

Two fields have no shape in the API contract. The SDK says so rather than inventing one.

| Field | Type | Where |
| --- | --- | --- |
| `Order.address` | `Record<string, unknown> \| null` | A frozen snapshot of the delivery address |
| `Order.quote` | `Record<string, unknown>` | A frozen snapshot of the fulfillment quote |

Read them defensively, narrow at the point of use, and render a fallback when the narrowing fails.
Do not build a screen whose layout depends on a key you have only seen once.

`CartLine.option_selection` and `OrderLine.option_selection` are `Record<string, unknown>` for a
different reason: they are reserved. Release one only ever sends and returns `{}`.

## `ProductAttribute`

```ts
interface ProductAttribute {
  key: string
  name: string                              // localized display label
  type: string                              // option, text, number, boolean; open
  value: string | number | boolean | null
}
```

Only `Product` carries `attributes`. A `ProductSummary` does not, so specs are a detail-page
feature. Match on `key`, label with `name`, and branch on `type` only for the cases you render:
`type` is open and a value added later must not break the theme. A boolean's `value` is a JSON
`true` or `false`, never `"true"` or `1`. Full notes on
[`catalog` → Attributes](/api/catalog#attributes).

## Images

One shape for every picture the catalog returns, plus the two taxonomy row types that carry one.

```ts
interface Image {
  id: string
  url: string                                  // the original; no width or height, by design
  alt: string | null                           // localized, null when nobody wrote one
  renditions: Record<string, ImageRendition>   // open map: thumbnail, medium, large today
}

interface ImageRendition {
  url: string
  width: number
  height: number
}

interface CategoryListItem extends Category {
  image: Image | null
}

interface BrandListItem extends Brand {
  image: Image | null
}
```

`Image` appears as `ProductSummary.image`, `Product.images`, `Variant.images`, on the taxonomy
listing rows above, and as `StoreInfo.branding.logo` and `StoreInfo.branding.icon`. It does not
appear on a `SearchProductHit`, and the `Category` and `Brand` embedded in a product summary stay
four fields with no image on them, which is why the listing rows are separate types.

A rendition url is read, never derived from the original's. A key that is not in `renditions` is a
size that has not been generated yet rather than a failure. Both rules, and the full field notes,
are on [`catalog` → Images](/api/catalog#images). Build attributes with
[`imageSrcSet`](#imagesrcset).

## `MediaAsset`

```ts
interface MediaAsset {
  id: string
  owner_type: string
  owner_id: string
  visibility: string
  status: string
  content_type: string
  byte_size: number
  checksum: string
  position: number | null
  alt_ar: string | null
  alt_en: string | null
  url: string | null
  processing_attempts: number
  failure_reason: string | null
  variants: MediaVariant[]
  created_at: string | null
}

interface MediaVariant {
  rendition: string
  width: number | null
  height: number | null
  byte_size: number | null
}
```

::: warning No client method produces one
No customer-facing endpoint returns a media asset. Store settings carry asset UUIDs and the
resolution endpoint is staff-only, so this type describes the staff-side shape rather than
something a call hands you. Catalog pictures are not this type, and neither is the store's
branding: both arrive as [`Image`](#images), which is what a gallery is built from.
:::

## Helpers

### `formatMoney`

```ts
formatMoney(money: Money, locale?: string, options?: Intl.NumberFormatOptions): string
```

Converts minor units using the currency's own fraction digits (not a hardcoded 100) and formats
with `Intl.NumberFormat`. `options` styles the output only; it never changes the conversion. See
[Money](/guide/money#formatmoney).

### `imageSrcSet`

```ts
imageSrcSet(image: Image): { src: string; srcset: string }
```

Turns an `Image` into the two attributes an `<img>` takes. `src` is the original url, which is
always there. `srcset` lists each rendition as `url width`, sorted narrowest first, over whatever
keys the image actually carries, so an image with no renditions yields an empty string rather than
a guess. See [`catalog` → imageSrcSet](/api/catalog#imagesrcset).

::: info Renditions are empty in release one
No encoder has shipped yet, so every image arrives with `renditions: {}` and this helper returns the
original url with an empty `srcset`, which browsers ignore. It is safe to bind now and it starts
serving sizes on its own once renditions are generated. Full note on
[`catalog` → imageSrcSet](/api/catalog#imagesrcset).
:::

### `uuidv7`

```ts
uuidv7(now?: number): string
```

An RFC 9562 UUIDv7: a 48-bit big-endian millisecond timestamp followed by 74 random bits, with the
version and variant bits pinned. Time-ordered, so the server can index it cheaply.

Implemented inline because the package carries no runtime dependencies. It needs Web Crypto and
throws a plain `Error` where `crypto.getRandomValues` is unavailable.

Use it for `operation_id` and `Idempotency-Key` values you want to control:

```ts
import { uuidv7 } from '@mawjod/api'

const attempt = { operationId: uuidv7(), idempotencyKey: uuidv7() }
```

The client generates these for you when you omit them, so reach for `uuidv7` only when you need to
hold the value before the call.

### `buildQuery` and `appendQuery`

```ts
buildQuery(input?: QueryInput | null): string          // no leading '?'
appendQuery(path: string, input?: QueryInput | null): string
```

The single query serializer every list uses. Exported because a theme that calls `useAsyncData`
directly may want the same encoding, for instance when building a canonical URL.

```ts
type QueryScalar = string | number | boolean

interface FilterRange {
  from?: QueryScalar | null
  to?: QueryScalar | null
}

type FilterValue = QueryScalar | QueryScalar[] | FilterRange | null | undefined
type SortValue = string | string[] | null | undefined
type PageValue = number | { number?: number | null; size?: number | null } | null | undefined

interface QueryInput {
  page?: PageValue
  sort?: SortValue
  filter?: Record<string, FilterValue> | null
  [key: string]: unknown
}
```

The rules it applies:

- `page` as an object becomes `page[number]` / `page[size]`; as a bare number it becomes flat `page`
  (which only search accepts)
- `sort` arrays join with commas, in order; a `-` prefix sorts descending
- `filter` arrays join with commas; `{ from, to }` becomes `filter[k][from]` / `filter[k][to]`;
  scalars pass through as `filter[k]`
- `null`, `undefined` and empty strings are dropped rather than sent

That last rule is deliberate: the API answers `422` for a blank `filter[q]`, and "the user cleared
the box" should not become a validation error.

## Cart token storage

```ts
interface CartTokenStorage {
  get(): string | null | Promise<string | null>
  set(token: string | null): void | Promise<void>
}

const CART_TOKEN_STORAGE_KEY = 'mawjod:cart_token'

function defaultCartTokenStorage(): CartTokenStorage
function localStorageCartTokenStorage(key?: string): CartTokenStorage
function memoryCartTokenStorage(initial?: string | null): CartTokenStorage
```

See [Cart → storage adapters](/guide/cart#storage-adapters).

## Namespace types

Each namespace's interface and its input types are exported, for annotating your own wrappers:

```ts
import type {
  MawjodClient,
  MawjodClientOptions,
  StoreNamespace,
  CatalogNamespace, CatalogProductsQuery,
  SearchNamespace, SearchProductsQuery,
  CartNamespace, AddCartLineInput,
  AuthNamespace, LoginInput, RegisterInput, ResetPasswordInput, VerifyInput,
  CustomerNamespace, AddressInput, UpdateProfileInput, AreasQuery,
  CheckoutNamespace, CheckoutInput, CheckoutOptions, CheckoutResult,
  OrdersNamespace, OrdersQuery, OrderStatus, CancelOrderInput, PayOrderInput,
  ReturnsNamespace, ReturnsQuery, ReturnStatus, CreateReturnInput, CreateReturnLineInput,
  CancelReturnInput, AddEvidenceInput,
  FulfillmentNamespace, FulfillmentQuoteInput,
  PlatformNamespace,
  HeadersOption,
} from '@mawjod/api'
```
