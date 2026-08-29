# Composables

Every composable here is auto-imported. Types are imported from `@mawjod/api`.

Data composables wrap `useAsyncData` and fetch on setup. Action composables (search, checkout,
mutations) are invoked, because they are user actions rather than page data.

## `MawjodAsyncOptions`

The data composables forward a narrow slice of `useAsyncData` options:

```ts
interface MawjodAsyncOptions {
  server?: boolean    // run the fetch during SSR. Default true.
  lazy?: boolean      // do not block navigation. Default false.
  immediate?: boolean // fetch immediately. Default true.
  dedupe?: 'cancel' | 'defer'
}
```

It is deliberately narrow. Anything richer is one line away: `useMawjodApi()` hands you the raw
client and `useAsyncData` is yours to call directly.

`immediate: false` is the one you will reach for most. It turns a data composable into a
mutations-only handle.

## `useMawjodApi()`

```ts
useMawjodApi(): MawjodClient
```

The raw [`@mawjod/api`](/api/store) client for this Nuxt app instance. Every other composable is a
thin wrapper over it.

```ts
const api = useMawjodApi()

const { data } = await useAsyncData('platform', () => api.platform.info())
```

When a composable does not fit, reach for this. It is the intended escape hatch.

Throws if the module plugin has not run, which means `@mawjod/nuxt` is missing from `modules` in
`nuxt.config`.

## `useMawjodLocale()`

```ts
useMawjodLocale(): Ref<string | null>
```

The `Accept-Language` sent with every call, as a writable ref. It starts at the module's `locale`
option; `null` means "send no header and let the API choose".

```vue
<script setup lang="ts">
const { locale } = useI18n()
const mawjodLocale = useMawjodLocale()

watch(locale, (next) => { mawjodLocale.value = next }, { immediate: true })
</script>
```

The client resolves it per request, so a change takes effect on the next call without rebuilding
anything.

Use it for direction too:

```vue
<template>
  <div :dir="mawjodLocale === 'ar' ? 'rtl' : 'ltr'" :lang="mawjodLocale ?? 'en'">
    <slot />
  </div>
</template>
```

## `useMawjodCartTokenStorage()`

```ts
useMawjodCartTokenStorage(): CartTokenStorage
```

Where the guest cart token lives for this app instance: `localStorage` in the browser, in-memory on
the server.

You rarely need this. `useCustomerAuth()` uses it to tell whether a guest cart exists before it
tries to merge one. Reach for `useMawjodApi()` for everything else.

## `useStoreInfo()`

```ts
useStoreInfo(options?: MawjodAsyncOptions)
```

`GET /store`, through `useAsyncData` with the key `mawjod:store`.

```vue
<script setup lang="ts">
const { data: store, pending, error } = await useStoreInfo()
</script>

<template>
  <h1>{{ store?.name }}</h1>
</template>
```

`StoreInfo` is `{ id, status, name, default_locale, branding }`. `name` is already localized by the
server. `branding.logo` and `branding.icon` are resolved images, each `null` until the store
uploads one, so bind the logo through `imageSrcSet()` and fall back to `name`. See
[`store`](/api/store).

Renditions are empty in release one, so the helper yields the original url and an empty `srcset`
today, and starts serving sizes once an encoder generates them. See
[`catalog` → imageSrcSet](/api/catalog#imagesrcset).

## `useStoreSettings()`

```ts
useStoreSettings(options?: MawjodAsyncOptions)
```

`GET /store/settings`, keyed `mawjod:store:settings`.

```ts
const { data: settings } = await useStoreSettings()

const methods = settings.value?.settings['checkout.allowed_payment_methods']?.value
const primary = (settings.value?.settings['branding.primary_color']?.value as string) ?? '#111827'
```

Each entry's `value` is `unknown`, because the settings catalogue is open-ended and each key has its
own shape. Narrow at the point of use with a fallback.

## `useStoreAvailability()`

```ts
useStoreAvailability(): {
  state: Ref<StoreAvailabilityState>
  available: ComputedRef<boolean>
  unavailable: ComputedRef<boolean>
  detail: ComputedRef<string | null>
  requestId: ComputedRef<string | null>
  reset: () => void
}
```

One "shop paused" screen for the whole theme.

`503 store_unavailable` is possible on every endpoint: the request is refused before it reaches the
handler and there is nothing to retry. The plugin wires the client's `onError` to this flag, so any
call anywhere flips it.

```vue
<script setup lang="ts">
const { unavailable, detail, requestId, reset } = useStoreAvailability()

async function retry() {
  reset()
  await refreshNuxtData()
}
</script>

<template>
  <ShopPaused v-if="unavailable" :detail="detail" :reference="requestId" @retry="retry" />
  <NuxtPage v-else />
</template>
```

`reset()` marks the store available again. Call it before retrying, or the screen never goes away.

The state is carried through the SSR payload, so a server-rendered outage stays rendered after
hydration instead of flashing.

## `useProducts()`

```ts
useProducts(
  query?: MaybeRefOrGetter<CatalogProductsQuery | undefined>,
  options?: MawjodAsyncOptions,
)
```

`GET /catalog/products`. The query may be a ref or a getter; the list refetches when it changes.

```vue
<script setup lang="ts">
const page = ref(1)

const { data, pending } = await useProducts(() => ({
  page: { number: page.value, size: 24 },
  sort: '-published_at',
  filter: { category: route.params.slug as string },
}))
</script>
```

The `useAsyncData` key is derived from the query's initial shape
(`mawjod:catalog:products:<key>`). That keeps two lists on one page apart while keeping one list's
key stable across navigations.

`filter.category` and `filter.brand` take slugs, and a slug is the same string in every locale. See
[`catalog`](/api/catalog).

## `useProduct()`

```ts
useProduct(slug: MaybeRefOrGetter<string>, options?: MawjodAsyncOptions)
```

`GET /catalog/products/{slug}`, keyed `mawjod:catalog:product:<slug>`. Refetches when the slug
changes.

```vue
<script setup lang="ts">
const route = useRoute()
const { data: product, error } = await useProduct(() => route.params.slug as string)
</script>
```

## `useCategories()`

```ts
useCategories(
  query?: MaybeRefOrGetter<CatalogTaxonomyQuery | undefined>,
  options?: MawjodAsyncOptions,
)
```

`GET /catalog/categories`, keyed `mawjod:categories:<key>`. The query may be a ref or a getter; the
list refetches when it changes.

This is what a nav is built from. The list is flat: categories have no hierarchy, so there is
nothing to nest.

```vue
<script setup lang="ts">
const locale = useMawjodLocale()
const { data } = await useCategories({ page: { size: 100 } })

const nav = computed(() =>
  [...(data.value?.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, locale.value ?? 'en'),
  ),
)
</script>
```

`sort` is `'created_at' | '-created_at'` and nothing else. `sort=name` is a `422` on the server,
because a name only exists inside a locale, and the type will not let you write it. Order by name
client-side, in the locale you are rendering, as above.

There is no `filter` key on the query at all. The server accepts and ignores `filter[…]` on this
endpoint today, which may tighten to a `422` later, so do not send one.

Every row has at least one visible product behind it, so a link built from `category.slug` can
never land on an empty product list. A category the vendor has not published into is absent here by
design. See [`catalog.categories.list`](/api/catalog#catalog-categories-list).

`data` is `Paginated<CategoryListItem>`: a `Category` plus an `image`, which is `null` when the
category has no picture. Only the listing rows carry one. The `category` on a product summary is a
plain `Category` and never does, which is why they are two types. See
[`catalog` → Images](/api/catalog#images).

## `useBrands()`

```ts
useBrands(
  query?: MaybeRefOrGetter<CatalogTaxonomyQuery | undefined>,
  options?: MawjodAsyncOptions,
)
```

`GET /catalog/brands`, keyed `mawjod:brands:<key>`. Same query type and same rules as
`useCategories()`, down to the hidden-when-empty behaviour.

```vue
<script setup lang="ts">
const { data: brands } = await useBrands({ page: { size: 100 } })
</script>
```

`data` is `Paginated<BrandListItem>`, the same split: `Brand` plus a nullable `image` on listing
rows only.

`brand.slug` goes back to `useProducts()` as `filter.brand`; `brand.id` is the UUID
[`useProductSearch()`](#useproductsearch) takes as `brand_id`.

## `useProductSearch()`

```ts
useProductSearch(initial?: SearchProductsQuery): {
  query: Ref<SearchProductsQuery>
  results: Ref<SearchResults<SearchProductHit> | null>
  hits: ComputedRef<SearchProductHit[]>
  meta: ComputedRef<SearchMeta | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  search: (patch?: SearchProductsQuery) => Promise<SearchResults<SearchProductHit>>
  reset: () => void
}
```

`GET /search/products`. Invoked, not fetched on setup, because search is a user action.

```vue
<script setup lang="ts">
const { hits, meta, search, pending, reset } = useProductSearch({ per_page: 24 })

const term = ref('')

async function submit() {
  await search({ q: term.value, page: 1 })
}
</script>

<template>
  <form @submit.prevent="submit">
    <input v-model="term">
    <button type="submit" :disabled="pending">Search</button>
  </form>

  <p v-if="meta && !meta.exhaustive_total">About {{ meta.total }} results</p>
  <p v-else-if="meta">{{ meta.total }} results</p>

  <ul>
    <li v-for="hit in hits" :key="hit.id">{{ hit.name_ar }}</li>
  </ul>
</template>
```

`search(patch)` merges `patch` into the stored query and then sends the whole thing, so successive
calls accumulate. Pass `page: 1` whenever the query text changes, or you will page through the
previous term's result count.

Hits carry `name_ar` and `name_en`, because the search index stores both locales and does not
resolve one. `slug` is single: a product has one slug whatever locale you are reading in, so a link
built from a hit needs no locale check.

::: warning The state is shared per app instance
`query` and `results` live on the Nuxt app instance, so two search widgets on one page share the
same query and the same results. That is intended for the single-search-page case, which is what
this composable is for.

For two independent searches, call `useMawjodApi().search.products()` and hold the results yourself.
:::

## `useCart()`

```ts
useCart(): {
  cart: Ref<Cart | null>
  latestQuote: Ref<CartQuote | null>
  lines: ComputedRef<CartLine[]>
  itemCount: ComputedRef<number>
  subtotal: ComputedRef<Money | null>
  isEmpty: ComputedRef<boolean>
  hasUnpurchasableLines: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<Cart>
  addLine: (input: AddCartLineInput) => Promise<Cart>
  updateLine: (lineId: string, quantity: number) => Promise<Cart>
  removeLine: (lineId: string) => Promise<Cart>
  applyCoupon: (code: string) => Promise<CartQuote>
  removeCoupon: () => Promise<CartQuote>
  quote: () => Promise<CartQuote>
  merge: (guestToken?: string) => Promise<Cart>
  setCart: (next: Cart | null) => void
  setQuote: (next: CartQuote | null) => void
}
```

The shared cart. Every mutation writes the response straight into shared state, so a badge in the
header and a line list on the page cannot disagree.

```vue
<script setup lang="ts">
const { lines, itemCount, latestQuote, refresh, quote, updateLine, removeLine } = useCart()

onMounted(async () => {
  await refresh()
  await quote()
})
</script>
```

Pricing lives on `latestQuote`, not on `cart`. `cart.subtotal` is the plain line total; discounts
and tax only exist on a `CartQuote`. Both `quote()` and the coupon calls populate `latestQuote`.

`setCart` and `setQuote` write the shared state without a call. They exist for `useCustomerAuth()`,
which uses them after a login merge; a theme rarely needs them.

::: warning Guest cart writes during SSR are not supported
On the server the guest token lives in memory for one request, so a cart created during SSR is
unreachable from the browser afterwards. Do guest cart writes in the browser: the `onMounted`
above, or an event handler. See [SSR](/nuxt/ssr#what-the-module-does-not-do).
:::

`merge()` is here for completeness; `useCustomerAuth()` calls it after login by default.

## `useCustomerAuth()`

```ts
useCustomerAuth(options?: { mergeCartOnLogin?: boolean }): {
  customer: Ref<Customer | null>
  isAuthenticated: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  mergeError: Ref<unknown>
  login: (input: LoginInput) => Promise<AuthSession>
  register: (input: RegisterInput) => Promise<Customer>
  verify: (input: VerifyInput) => Promise<Customer>
  resendVerification: (identity: string) => Promise<AcceptedStatus>
  forgotPassword: (identity: string) => Promise<AcceptedStatus>
  resetPassword: (input: ResetPasswordInput) => Promise<PasswordResetStatus>
  logout: () => Promise<SignedOutStatus>
  mergeGuestCart: () => Promise<void>
}
```

Customer sessions. Identity rides a Sanctum session cookie, and there is no token to hold.

```vue
<script setup lang="ts">
const { login, pending, mergeError } = useCustomerAuth()

async function submit() {
  await login({ identity: identity.value, password: password.value })
  await navigateTo('/account')
}
</script>
```

### `mergeCartOnLogin`

On by default. After a successful login, the guest cart is handed to the account that just signed
in, because a shopper who filled a cart and then logged in expects to keep it.

The merge is skipped when no guest cart token is stored, and a failing merge never fails the
login: the session is real either way, and the reason lands on `mergeError` rather than being
thrown. Surface it as a soft notice, not as a login failure.

```ts
const { login } = useCustomerAuth({ mergeCartOnLogin: false })
```

### `register()` and `verify()` do not create a session

Neither populates `customer`, because neither signs anyone in. Route a freshly registered shopper to
a verification screen, and a freshly verified one to the login page.

### `logout()`

Clears `customer`, the shared cart, the shared quote, `mergeError`, and the stored guest cart token.

### `customer` starts `null`

On a fresh page load `customer` is `null` even for a shopper whose session cookie is still valid,
because nothing has asked the server yet. Call `useCustomerProfile()` when you need to know on first
render, and treat a `401` as signed out.

## `useCustomerProfile()`

```ts
useCustomerProfile(options?: MawjodAsyncOptions): {
  profile: Ref<Customer | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  updating: Ref<boolean>
  updateError: Ref<unknown>
  update: (input: UpdateProfileInput) => Promise<Customer>
}
```

`GET | PATCH /customer/profile`, keyed `mawjod:customer:profile`. The update writes its response back
into `profile`.

```vue
<script setup lang="ts">
const { profile, update, updating, updateError } = useCustomerProfile()

async function rename(name: string) {
  await update({ name })
}
</script>
```

Read and write have separate flags: `pending` / `error` for the fetch, `updating` / `updateError` for
the mutation. That is the pattern across every composable that does both.

## `useAddresses()`

```ts
useAddresses(options?: MawjodAsyncOptions): {
  addresses: ComputedRef<Address[]>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  mutating: Ref<boolean>
  mutationError: Ref<unknown>
  create: (input: AddressInput) => Promise<Address>
  update: (addressId: string, input: AddressInput) => Promise<Address>
  remove: (addressId: string) => Promise<void>
}
```

`/customer/addresses`, keyed `mawjod:customer:addresses`.

Every mutation refetches the list rather than patching it locally. The server decides which address
is default, and a create or update can move that flag off another row, so a local patch would show
two defaults or none.

`update()` is a full replace, not a patch. Send every required field. See
[`customer`](/api/customer#customer-addresses-update).

## `useAreas()`

```ts
useAreas(
  query?: MaybeRefOrGetter<AreasQuery | undefined>,
  options?: MawjodAsyncOptions,
)
```

`GET /customer/areas`, keyed `mawjod:areas:<key>`. The query may be a ref or a getter; the list
refetches when it changes.

This is where an `area_id` for `useAddresses().create()` comes from. An address form is two calls:
the governorates, then the cities inside the one the shopper picked.

```vue
<script setup lang="ts">
const governorateId = ref<string | null>(null)

const { data: governorates } = await useAreas({ filter: { level: 'governorate' }, sort: 'code' })

const { data: cities, refresh: refreshCities } = await useAreas(
  () => ({ filter: { level: 'city', parent: governorateId.value ?? undefined }, sort: 'code' }),
  { immediate: false },
)

watch(governorateId, () => refreshCities())
</script>
```

`filter.level` takes one level, never a set: the server refuses a comma-joined value with a `422`,
so the type is a single string and the set form cannot be written. `filter.parent` is one area
UUIDv7.

Every row carries `name_ar` and `name_en`. This list resolves no locale, unlike `useProducts()`, so
pick the name for the locale you are rendering in.

The key comes from the query's initial shape, so a governorate list and a city list on one form do
not share a cache entry. See [`customer.areas.list`](/api/customer#customer-areas-list).

## `useCheckout()`

```ts
useCheckout(): {
  attempt: Ref<CheckoutAttempt | null>
  result: Ref<CheckoutResult | null>
  order: ComputedRef<Order | null>
  staleCart: Ref<(MawjodApiError & { code: StaleCartErrorCode }) | null>
  isStale: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  place: (input: CheckoutInput, options?: { idempotencyKey?: string }) => Promise<CheckoutResult>
  retry: (input?: CheckoutInput) => Promise<CheckoutResult>
  reset: () => void
}
```

`POST /customer/checkout`.

The idempotency pair is minted before the call rather than read off a successful response: an
attempt that fails is exactly the one that needs retrying under the same key. It lives on `attempt`
as `{ idempotencyKey, operationId }`.

```vue
<script setup lang="ts">
const { place, order, staleCart, isStale, pending } = useCheckout()
const { refresh: refreshCart, quote } = useCart()

async function submit() {
  try {
    await place({
      fulfillment_method: 'delivery',
      payment_method: method.value,
      address_id: addressId.value,
      expected_items_subtotal_minor: subtotalMinor.value,
    })
  } catch (error) {
    if (isStale.value) {
      await refreshCart()
      await quote()

      return // show what changed, then let them press the button again
    }

    throw error
  }
}
</script>
```

### `place()` versus `retry()`

`place()` mints a new pair. `retry()` replays the stored input under the stored pair.

| Situation | Call |
| --- | --- |
| The request never got an answer (dropped connection, timeout) | `retry()` |
| `cart_price_changed`, `cart_not_purchasable`, `insufficient_stock` | `place()` again, after refetching |
| The shopper changed anything on the form | `place()` |

The server pins the key to `{operation_id, fulfillment_method, payment_method, address_id,
pickup_location_id, expected_items_subtotal_minor}`. Reuse the key with any of those changed and it
answers a conflict, not a replay, which is exactly what `retry()` would produce after a stale-cart
failure, since the corrected subtotal is one of the pinned fields.

::: danger Never retry a stale-cart failure
`retry()` is for transport failures. After a 409 the shopper has not seen what they are now being
charged: refetch, show the change, and let them confirm with a fresh `place()`.
:::

`retry()` throws a plain `Error` if there is no earlier `place()` to replay.

### `staleCart`

Set when the attempt failed with one of the three stale-cart codes, so a template can branch without
a `try`/`catch`:

```vue
<div v-if="isStale" role="alert">
  <p v-if="staleCart?.code === 'insufficient_stock'">Some items are no longer in stock.</p>
  <p v-else-if="staleCart?.code === 'cart_price_changed'">Some prices have changed.</p>
  <p v-else>Some items can no longer be bought.</p>
</div>
```

`reset()` clears the attempt, the result, the stored input, `staleCart` and the error. Call it when
the shopper leaves the checkout page.

See [Checkout](/guide/checkout).

## `useOrders()`

```ts
useOrders(
  query?: MaybeRefOrGetter<OrdersQuery | undefined>,
  options?: MawjodAsyncOptions,
): {
  orders: ComputedRef<Order[]>
  page: Ref<Paginated<Order> | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  mutating: Ref<boolean>
  mutationError: Ref<unknown>
  get: (orderId: string) => Promise<Order>
  cancel: (orderId: string, input: CancelOrderInput) => Promise<Order>
  pay: (orderId: string, input?: PayOrderInput) => Promise<PaymentSession>
}
```

`/customer/orders`, keyed `mawjod:orders:<query key>`.

```vue
<script setup lang="ts">
const { orders, page, cancel, mutating } = useOrders(() => ({
  page: { number: pageNumber.value },
  sort: '-placed_at',
  filter: { status: statusFilter.value },
}))
</script>
```

`orders` is the rows; `page` is the whole `Paginated<Order>` when you need `links` or `meta`.

::: tip It fetches on setup
Pass `{ immediate: false }` when a page only needs the mutation methods, such as an order detail
page that reads one order and may cancel it but has no use for a list:

```ts
const { get, cancel, pay } = useOrders(undefined, { immediate: false })
```
:::

## `useReturns()`

```ts
useReturns(
  query?: MaybeRefOrGetter<ReturnsQuery | undefined>,
  options?: MawjodAsyncOptions,
): {
  returns: ComputedRef<Return[]>
  page: Ref<Paginated<Return> | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  mutating: Ref<boolean>
  mutationError: Ref<unknown>
  get: (returnId: string) => Promise<Return>
  create: (input: CreateReturnInput) => Promise<Return>
  cancel: (returnId: string, input: CancelReturnInput) => Promise<Return>
  addEvidence: (returnId: string, input: AddEvidenceInput) => Promise<ReturnEvidence>
  getEvidence: (returnId: string, evidenceId: string) => Promise<ReturnEvidence>
}
```

`/customer/returns`, keyed `mawjod:returns:<query key>`. Same list-filter contract as orders, keyed
on `requested_at` instead of `placed_at`.

::: tip It fetches on setup
Pass `{ immediate: false }` when a page only needs the mutations, such as a "request a return"
form:

```ts
const { create, addEvidence } = useReturns(undefined, { immediate: false })
```
:::

See [`returns`](/api/returns).

## `useFulfillment()`

```ts
useFulfillment(options?: MawjodAsyncOptions): {
  pickupLocations: ComputedRef<PickupLocation[]>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  lastQuote: Ref<FulfillmentQuote | null>
  quoting: Ref<boolean>
  quoteError: Ref<unknown>
  quote: (input: FulfillmentQuoteInput) => Promise<FulfillmentQuote>
}
```

`/customer/fulfillment`, keyed `mawjod:fulfillment:pickup-locations`.

Pickup locations are page data and load on setup. A shipping quote is a `POST` that depends on the
chosen address or pickup point, so it is invoked and its result lands on `lastQuote`.

```vue
<script setup lang="ts">
const { pickupLocations, quote, lastQuote, quoting } = useFulfillment()
const { latestQuote } = useCart()

async function priceIt() {
  if (latestQuote.value === null) return

  await quote({
    method: 'delivery',
    subtotal_minor: latestQuote.value.discounted_subtotal.minor,
    address_id: addressId.value,
  })
}
</script>
```

`lastQuote.allowed_payment_methods` is the narrowest correct source for which payment methods to
offer, because a particular pickup point may accept less than the store does in general.

::: tip It fetches on setup
Pass `{ immediate: false }` when a page only needs `quote()`:

```ts
const { quote } = useFulfillment({ immediate: false })
```
:::

## The pending / error pattern

Composables that both fetch and mutate keep two pairs of flags, so a mutation in flight does not
make the list look like it is reloading:

| Composable | Fetch | Mutate |
| --- | --- | --- |
| `useCustomerProfile` | `pending` / `error` | `updating` / `updateError` |
| `useAddresses` | `pending` / `error` | `mutating` / `mutationError` |
| `useOrders` | `pending` / `error` | `mutating` / `mutationError` |
| `useReturns` | `pending` / `error` | `mutating` / `mutationError` |
| `useFulfillment` | `pending` / `error` | `quoting` / `quoteError` |
| `useCart` | one pair; every method is a mutation | |
| `useCheckout`, `useProductSearch`, `useCustomerAuth` | one pair | |

Errors are recorded on the ref and rethrown. Nothing is swallowed, so a `try`/`catch` at the call
site still works and the ref is there for the template.
