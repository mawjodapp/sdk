# Building a theme

A minimal storefront, end to end, with `@mawjod/nuxt`. Six screens: a product list, a product page,
a cart drawer, a login page, a checkout page, and the "shop paused" screen that has to exist because
the API can pause the shop from under any call.

The markup here is deliberately plain. Nothing depends on a CSS framework, and every composable and
type used is exported by the packages.

## Setup

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

Every composable below is auto-imported. Nothing needs a manual import except types.

## The app shell

The shell does four things: sets direction from the locale, shows the shop-paused screen when the
API has said the shop is paused, hangs the cart drawer off a header badge, and puts a category nav
in the header.

```vue
<!-- app.vue -->
<script setup lang="ts">
import { imageSrcSet } from '@mawjod/api'

const locale = useMawjodLocale()
const { unavailable } = useStoreAvailability()
const { data: store } = await useStoreInfo()
const { itemCount } = useCart()

const drawerOpen = ref(false)

const logo = computed(() => store.value?.branding.logo ?? null)
</script>

<template>
  <div :dir="locale === 'ar' ? 'rtl' : 'ltr'" :lang="locale ?? 'en'">
    <ShopPaused v-if="unavailable" />

    <template v-else>
      <header>
        <NuxtLink to="/">
          <img
            v-if="logo"
            v-bind="imageSrcSet(logo)"
            :alt="logo.alt ?? store?.name"
          >
          <template v-else>{{ store?.name }}</template>
        </NuxtLink>

        <CategoryNav />

        <SearchBox />

        <button type="button" @click="drawerOpen = true">
          Cart ({{ itemCount }})
        </button>
      </header>

      <NuxtPage />

      <CartDrawer v-model:open="drawerOpen" />
    </template>
  </div>
</template>
```

`store.branding.logo` is the store's logo, a full image with renditions, or `null` when the store
has not set one. That is why the header falls back to `store.name`, which the server has already
localized. See [Branding](#branding) at the end.

`imageSrcSet()` fills in the `src` and `srcset` attributes. Renditions are empty in release one, so
today that renders the original logo and nothing else, and the header picks up the smaller sizes on
its own once an encoder generates them. See
[`catalog` → imageSrcSet](/api/catalog#imagesrcset).

## The category nav

`useCategories()` is where the nav's entries come from. The list is flat: categories have no
hierarchy in release one, so there is nothing to nest and no parent to follow.

```vue
<!-- components/CategoryNav.vue -->
<script setup lang="ts">
const locale = useMawjodLocale()
const { data } = await useCategories({ page: { size: 100 } })

const nav = computed(() =>
  [...(data.value?.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, locale.value ?? 'en'),
  ),
)
</script>

<template>
  <nav>
    <NuxtLink
      v-for="category in nav"
      :key="category.id"
      :to="{ path: '/', query: { category: category.slug } }"
    >
      {{ category.name }}
    </NuxtLink>
  </nav>
</template>
```

The server sorts these by `created_at` only, so alphabetical order is your job. That is deliberate
rather than a gap: `localeCompare` with the locale you are rendering puts an Arabic nav in Arabic
order and an English one in English order, which one server-side sort could not do for both.

Every category that comes back has at least one product behind it, so no link in this nav lands on
an empty list. A category the vendor has created but not published anything into is simply not in
the response. See [`catalog.categories.list`](/api/catalog#catalog-categories-list).

Listing rows may carry an `image`, which is `null` when the category has none, so a picture nav is
possible here where a product card's `category` could never supply one. Same for `useBrands()`.

`useBrands()` is the same call with the same rules, if the theme wants a brand nav too.

## The shop-paused screen

`503 store_unavailable` can come back from any endpoint. The module wires the client's `onError` to
a shared flag, so one call anywhere flips it and one screen covers the whole theme.

```vue
<!-- components/ShopPaused.vue -->
<script setup lang="ts">
const { detail, requestId, reset } = useStoreAvailability()

async function retry() {
  reset()
  await refreshNuxtData()
}
</script>

<template>
  <main>
    <h1>The shop is closed right now</h1>
    <p v-if="detail">{{ detail }}</p>
    <button type="button" @click="retry">Try again</button>
    <p v-if="requestId">Reference: {{ requestId }}</p>
  </main>
</template>
```

`reset()` marks the store available again. Call it before retrying, or the screen never goes away.

## Product list

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
import { formatMoney, imageSrcSet } from '@mawjod/api'

const route = useRoute()
const page = ref(1)

const { data, pending, error } = await useProducts(() => ({
  page: { number: page.value, size: 24 },
  sort: '-published_at',
  filter: { category: (route.query.category as string) ?? null },
}))
</script>

<template>
  <main>
    <p v-if="pending">Loading…</p>
    <p v-else-if="error">Could not load products.</p>

    <ul v-else>
      <li v-for="product in data?.data ?? []" :key="product.id">
        <NuxtLink :to="`/products/${product.slug}`">
          <img
            v-if="product.image"
            v-bind="imageSrcSet(product.image)"
            sizes="(max-width: 600px) 50vw, 300px"
            :alt="product.image.alt ?? product.name"
            loading="lazy"
          >
          <h2>{{ product.name }}</h2>
          <p>{{ product.brand.name }}</p>
          <p>from {{ formatMoney(product.from_price, 'ar-EG') }}</p>
        </NuxtLink>
      </li>
    </ul>

    <nav v-if="data">
      <button type="button" :disabled="page <= 1" @click="page -= 1">Previous</button>
      <span>{{ data.meta.current_page }} / {{ data.meta.last_page }}</span>
      <button
        type="button"
        :disabled="data.meta.current_page >= data.meta.last_page"
        @click="page += 1"
      >
        Next
      </button>
    </nav>
  </main>
</template>
```

`product.image` is `null` for a product with no photo, so the card has to render without one. `alt`
is `null` whenever nobody wrote alternative text, which is why the product name is the fallback.
See [`catalog` → Images](/api/catalog#images).

`imageSrcSet()` spreads into `src` and `srcset`, and `sizes` is yours to write because only the
layout knows how wide a card renders. Renditions are empty in release one, so each card shows the
original today and starts picking a size per viewport once an encoder generates them, with no edit
to this template. See [`catalog` → imageSrcSet](/api/catalog#imagesrcset).

The getter form of the query makes the list refetch when `page` or the route's category changes.
`filter.category` takes a category slug. One category has one slug shared by every locale, so the
same `?category=` value narrows the list in Arabic and in English, and the route needs no locale for
the filter to resolve.

## Product page

```vue
<!-- pages/products/[slug].vue -->
<script setup lang="ts">
import { formatMoney, isMawjodApiError, type Variant } from '@mawjod/api'

const route = useRoute()
const { data: product, error } = await useProduct(() => route.params.slug as string)
const { addLine, pending } = useCart()

const chosen = ref<Variant | null>(null)
const addError = ref<string | null>(null)

const selected = computed<Variant | null>({
  get: () => chosen.value ?? product.value?.variants.find((variant) => variant.available) ?? null,
  set: (variant) => { chosen.value = variant },
})

async function add() {
  if (selected.value === null) return

  addError.value = null

  try {
    await addLine({ variant_id: selected.value.id, quantity: 1 })
  } catch (cause) {
    addError.value = isMawjodApiError(cause) && cause.code === 'variant_not_purchasable'
      ? 'That option is not available right now.'
      : 'Could not add this to the cart.'
  }
}
</script>

<template>
  <main v-if="product">
    <h1>{{ product.name }}</h1>
    <p>{{ product.description }}</p>

    <fieldset>
      <legend>Options</legend>
      <label v-for="variant in product.variants" :key="variant.id">
        <input
          v-model="selected"
          type="radio"
          name="variant"
          :value="variant"
          :disabled="!variant.available"
        >
        {{ variant.sku }} — {{ formatMoney(variant.price, 'ar-EG') }}
        <span v-if="!variant.available">(out of stock)</span>
      </label>
    </fieldset>

    <button type="button" :disabled="selected === null || pending" @click="add">
      Add to cart
    </button>

    <p v-if="addError">{{ addError }}</p>

    <dl v-if="product.attributes.length">
      <template v-for="attribute in product.attributes" :key="attribute.key">
        <dt>{{ attribute.name }}</dt>
        <dd>{{ attribute.value }}</dd>
      </template>
    </dl>
  </main>

  <main v-else-if="error">
    <h1>Not found</h1>
  </main>
</template>
```

Pick the default with a computed and a fallback, not a watcher. During server rendering a watcher
runs at most once, at registration, and is never re-run, so a default that depends on anything
arriving or changing after setup never reaches the rendered HTML: a reader without JavaScript gets
a page with no variant selected and a disabled buy button. A computed evaluates whenever it is
read, on the server too, and the markup arrives complete.

Product detail is addressed by slug, not id. The slug does not change with the locale, so one
`[slug].vue` route answers in both languages and a shared product link survives a language switch.
`variants` only appears on the detail response; a `ProductSummary` from a list carries
`variants_count` and `from_price` instead.

The picker above labels each option with `variant.sku` because there is nothing better. A `Variant`
is `{ id, sku, barcode, price, available, images }`, with no customer-facing name on it, and
`option_selection` on a cart line is reserved and always `{}`. So a shop selling one bottle in
500ml, 750ml and 1L gets three variants that differ only by id, sku and price, and the API says
nothing about which is which. The theme has to derive the label itself: from `price` when the sizes
are priced apart, or from a SKU convention the vendor agrees to keep, or from a product attribute
the vendor fills in. Whatever you pick, it is a convention between the theme and the vendor rather
than something the API guarantees. The gap is reported to the backend.

`product.images` is the gallery, and `product.image` is `images[0]` rather than a separate asset.
`variant.images` is always an array and is usually empty, so fall back to the product's pictures
when the selected variant has none.

`product.attributes` is the specs list. It is detail-only, like `variants`, so a product card
cannot show it. Each entry carries a localized `name` to label with and a `type` you can branch on
for richer rendering. See [`catalog` → Attributes](/api/catalog#attributes).

## Cart drawer

```vue
<!-- components/CartDrawer.vue -->
<script setup lang="ts">
import { formatMoney } from '@mawjod/api'

const open = defineModel<boolean>('open', { required: true })

const locale = useMawjodLocale()
const {
  cart, lines, itemCount, isEmpty, hasUnpurchasableLines,
  latestQuote, refresh, updateLine, removeLine, applyCoupon, quote, pending,
} = useCart()

const coupon = ref('')
const couponError = ref<string | null>(null)

onMounted(async () => {
  await refresh()
  await quote()
})

async function submitCoupon() {
  couponError.value = null

  try {
    await applyCoupon(coupon.value)
  } catch {
    couponError.value = 'That code cannot be used.'
  }
}

function nameOf(line: { name_ar: string; name_en: string }) {
  return locale.value === 'ar' ? line.name_ar : line.name_en
}
</script>

<template>
  <aside v-if="open">
    <button type="button" @click="open = false">Close</button>

    <p v-if="isEmpty">Your cart is empty.</p>

    <ul v-else>
      <li v-for="line in lines" :key="line.id">
        <span>{{ nameOf(line) }}</span>
        <input
          type="number"
          min="1"
          max="999"
          :value="line.quantity"
          :disabled="pending"
          @change="updateLine(line.id, Number(($event.target as HTMLInputElement).value))"
        >
        <span>{{ formatMoney(line.line_total, 'ar-EG') }}</span>
        <span v-if="!line.purchasable">Unavailable</span>
        <button type="button" @click="removeLine(line.id)">Remove</button>
      </li>
    </ul>

    <p v-if="hasUnpurchasableLines">
      Remove the unavailable items before checking out.
    </p>

    <form v-if="!isEmpty" @submit.prevent="submitCoupon">
      <input v-model="coupon" placeholder="Coupon code">
      <button type="submit">Apply</button>
      <p v-if="couponError">{{ couponError }}</p>
    </form>

    <dl v-if="latestQuote">
      <dt>Subtotal</dt>
      <dd>{{ formatMoney(latestQuote.subtotal, 'ar-EG') }}</dd>
      <template v-if="latestQuote.applied_discount">
        <dt>{{ locale === 'ar' ? latestQuote.applied_discount.name_ar : latestQuote.applied_discount.name_en }}</dt>
        <dd>-{{ formatMoney(latestQuote.discount_total, 'ar-EG') }}</dd>
      </template>
      <dt>Tax</dt>
      <dd>{{ formatMoney(latestQuote.tax_amount, 'ar-EG') }}</dd>
    </dl>

    <NuxtLink v-if="!isEmpty" to="/checkout">
      Checkout ({{ itemCount }})
    </NuxtLink>
  </aside>
</template>
```

Pricing lives on the quote, not on the cart. `cart.subtotal` is the plain line total; discounts and
tax only exist on `CartQuote`. `useCart()` keeps the last quote in `latestQuote`, and both `quote()`
and the coupon calls populate it.

Cart lines carry `name_ar` and `name_en` together, unlike the catalog which resolves one locale
server-side. That is on purpose: a stored line renders correctly whichever locale the shopper was in
when they added it.

The `onMounted` matters too: guest cart writes during SSR are not supported, so the drawer fetches
in the browser.

## Login

```vue
<!-- pages/login.vue -->
<script setup lang="ts">
import { isMawjodApiError } from '@mawjod/api'

const { login, pending, mergeError } = useCustomerAuth()

const identity = ref('')
const password = ref('')
const failed = ref(false)

async function submit() {
  failed.value = false

  try {
    await login({ identity: identity.value, password: password.value })
    await navigateTo('/account')
  } catch (error) {
    if (isMawjodApiError(error) && error.status === 401) {
      failed.value = true
    } else {
      throw error
    }
  }
}
</script>

<template>
  <main>
    <form @submit.prevent="submit">
      <label>
        Email or phone
        <input v-model="identity" required>
      </label>

      <label>
        Password
        <input v-model="password" type="password" required>
      </label>

      <button type="submit" :disabled="pending">Sign in</button>

      <p v-if="failed">Those details did not match an account.</p>
      <p v-if="mergeError">We could not move your basket over. It is still there — try again.</p>
    </form>

    <NuxtLink to="/register">Create an account</NuxtLink>
  </main>
</template>
```

One message for every failure, because the API gives one answer for every failure. Wrong password,
unknown account and unverified account are indistinguishable on purpose, so do not invent a
distinction the server refuses to make.

`useCustomerAuth()` merges the guest cart after a successful login by default. A failing merge never
fails the login: the session is real either way, and the reason lands on `mergeError`.

Registration is the same shape, with one thing to remember:

```vue
<!-- pages/register.vue -->
<script setup lang="ts">
const { register } = useCustomerAuth()

async function submit() {
  await register({
    name: name.value,
    email: email.value,
    password: password.value,
    password_confirmation: confirmation.value,
  })

  // register() does not create a session. Send them to verification, not to the account page.
  await navigateTo(`/verify?identity=${encodeURIComponent(email.value)}`)
}
</script>
```

`verify()` does not create a session either. After verifying, send them to the login page.

## Checkout

The longest screen, and the one with the most rules. It picks a fulfillment method, quotes it,
reads the payment methods the store offers, places the order, and handles the two kinds of failure
differently.

```vue
<!-- pages/checkout.vue -->
<script setup lang="ts">
import { formatMoney, isMawjodApiError } from '@mawjod/api'

const api = useMawjodApi()
const { cart, latestQuote, quote: repriceCart, refresh: refreshCart } = useCart()
const { addresses } = useAddresses()
const { pickupLocations, quote: quoteFulfillment, lastQuote } = useFulfillment()
const { place, staleCart, isStale, pending } = useCheckout()
const { data: settings } = await useStoreSettings()

const method = ref<'delivery' | 'pickup'>('delivery')
const addressId = ref<string | null>(null)
const pickupLocationId = ref<string | null>(null)
const paymentMethod = ref<string>('cod')
const notVerified = ref(false)

// Never hardcode payment methods. The store decides, and a quote can narrow it further.
const allowedPaymentMethods = computed<string[]>(() => {
  const fromQuote = lastQuote.value?.allowed_payment_methods

  if (fromQuote !== undefined) return fromQuote

  const entry = settings.value?.settings['checkout.allowed_payment_methods']

  return Array.isArray(entry?.value) ? (entry?.value as string[]) : ['cod']
})

onMounted(async () => {
  await refreshCart()
  await repriceCart()
})

async function getShippingQuote() {
  if (latestQuote.value === null) return

  await quoteFulfillment({
    method: method.value,
    subtotal_minor: latestQuote.value.discounted_subtotal.minor,
    address_id: method.value === 'delivery' ? addressId.value : null,
    pickup_location_id: method.value === 'pickup' ? pickupLocationId.value : null,
  })
}

async function submit() {
  if (latestQuote.value === null) return

  notVerified.value = false

  try {
    const { order: placed } = await place({
      fulfillment_method: method.value,
      payment_method: paymentMethod.value,
      address_id: method.value === 'delivery' ? addressId.value : null,
      pickup_location_id: method.value === 'pickup' ? pickupLocationId.value : null,
      expected_items_subtotal_minor: latestQuote.value.discounted_subtotal.minor,
    })

    // The server says whether payment still needs a redirect. Do not infer it from the method.
    if (placed.payment?.requires_action) {
      const session = await api.orders.pay(placed.id)

      window.location.assign(session.url)

      return
    }

    await navigateTo(`/orders/${placed.id}`)
  } catch (error) {
    if (isStale.value) {
      // 409 family: the world moved. Refetch, show the change, let them confirm.
      await refreshCart()
      await repriceCart()

      return
    }

    if (isMawjodApiError(error) && error.code === 'customer_not_verified') {
      notVerified.value = true

      return
    }

    throw error
  }
}
</script>

<template>
  <main>
    <fieldset>
      <legend>How would you like it?</legend>
      <label><input v-model="method" type="radio" value="delivery" @change="getShippingQuote"> Delivery</label>
      <label><input v-model="method" type="radio" value="pickup" @change="getShippingQuote"> Pick up</label>
    </fieldset>

    <fieldset v-if="method === 'delivery'">
      <legend>Address</legend>
      <label v-for="address in addresses" :key="address.id">
        <input v-model="addressId" type="radio" :value="address.id" @change="getShippingQuote">
        {{ address.label }} — {{ address.line_one }}
      </label>
      <NuxtLink to="/account/addresses">Add an address</NuxtLink>
    </fieldset>

    <fieldset v-else>
      <legend>Pick-up point</legend>
      <label v-for="location in pickupLocations" :key="location.id">
        <input v-model="pickupLocationId" type="radio" :value="location.id" @change="getShippingQuote">
        {{ location.name_ar }} — {{ location.address_line }}
      </label>
    </fieldset>

    <fieldset>
      <legend>Payment</legend>
      <label v-for="option in allowedPaymentMethods" :key="option">
        <input v-model="paymentMethod" type="radio" :value="option">
        {{ option === 'cod' ? 'Cash on delivery' : option }}
      </label>
    </fieldset>

    <dl v-if="latestQuote">
      <dt>Items</dt>
      <dd>{{ formatMoney(latestQuote.discounted_subtotal, 'ar-EG') }}</dd>
      <template v-if="lastQuote">
        <dt>{{ method === 'delivery' ? 'Delivery' : 'Pick-up' }}</dt>
        <dd>{{ formatMoney(lastQuote.fee, 'ar-EG') }}</dd>
        <dt>Ready in</dt>
        <dd>{{ lastQuote.eta.minimum_minutes }}–{{ lastQuote.eta.maximum_minutes }} minutes</dd>
      </template>
    </dl>

    <div v-if="isStale" role="alert">
      <h2>Your basket changed</h2>
      <p v-if="staleCart?.code === 'insufficient_stock'">Some items are no longer in stock in that quantity.</p>
      <p v-else-if="staleCart?.code === 'cart_price_changed'">Some prices have changed.</p>
      <p v-else>Some items can no longer be bought.</p>
      <p>Check the updated basket below, then place the order again.</p>
    </div>

    <div v-if="notVerified" role="alert">
      <p>Verify your account before ordering.</p>
      <NuxtLink to="/verify">Verify now</NuxtLink>
    </div>

    <button type="button" :disabled="pending || cart === null" @click="submit">
      Place order
    </button>
  </main>
</template>
```

A stale-cart failure gets a fresh attempt, never a retry. After `cart_price_changed`,
`cart_not_purchasable` or `insufficient_stock`, refetch, show what changed, and let the shopper press
the button again, which calls `place()` and mints a new idempotency pair. `useCheckout().retry()`
reuses the old pair, which is right for a dropped connection and wrong here: the pinned
`expected_items_subtotal_minor` has changed, so the server would answer a conflict rather than a
replay.

Payment methods come from the store, never from a constant. `cod` is always offered; `paymob`
only when the deployment has the gateway configured. A fulfillment quote narrows it further, because
a particular pickup point may accept less than the store does in general.

### The address form

The delivery fieldset above lists saved addresses, and the link next to it goes here. Saving an
address needs an `area_id`, which comes from `useAreas()`: the governorates first, then the cities
inside whichever one the shopper picked.

```vue
<!-- pages/account/addresses.vue -->
<script setup lang="ts">
const locale = useMawjodLocale()
const { create, mutating } = useAddresses()

const governorateId = ref<string | null>(null)
const cityId = ref<string | null>(null)

const { data: governorates } = await useAreas({ filter: { level: 'governorate' }, sort: 'code' })

// Nothing to list until a governorate is chosen, so this one starts idle.
const { data: cities, refresh: refreshCities } = await useAreas(
  () => ({ filter: { level: 'city', parent: governorateId.value ?? undefined }, sort: 'code' }),
  { immediate: false },
)

watch(governorateId, async () => {
  cityId.value = null
  await refreshCities()
})

function nameOf(area: { name_ar: string; name_en: string }) {
  return locale.value === 'ar' ? area.name_ar : area.name_en
}

// The rest of the form: label, recipient, line_one and the map position.
const details = reactive({
  label: '',
  recipient_name: '',
  recipient_phone: '',
  line_one: '',
  position: { longitude: 31.2357, latitude: 30.0444 },
})

async function save() {
  await create({ ...details, area_id: cityId.value! })
}
</script>

<template>
  <form @submit.prevent="save">
    <label>
      Governorate
      <select v-model="governorateId">
        <option v-for="area in governorates?.data ?? []" :key="area.id" :value="area.id">
          {{ nameOf(area) }}
        </option>
      </select>
    </label>

    <label>
      City
      <select v-model="cityId" :disabled="governorateId === null">
        <option v-for="area in cities?.data ?? []" :key="area.id" :value="area.id">
          {{ nameOf(area) }}
        </option>
      </select>
    </label>

    <!-- the label, recipient and line_one inputs bind to `details` -->

    <button type="submit" :disabled="cityId === null || mutating">Save address</button>
  </form>
</template>
```

`filter.level` takes one level, never a set, so a governorate list and a city list are two calls
rather than one. Areas carry `name_ar` and `name_en` together, like cart lines and unlike the
catalog, so pick the name yourself. Send the deepest area the shopper chose as `area_id`; an id the
store does not have comes back as `422 validation_failed` under `errors.area_id`.

## Order confirmation

```vue
<!-- pages/orders/[id].vue -->
<script setup lang="ts">
import { formatMoney, isPayloadIntegrityError } from '@mawjod/api'

const route = useRoute()
const api = useMawjodApi()
const locale = useMawjodLocale()

const { data: order, error } = await useAsyncData(
  `order:${route.params.id}`,
  () => api.orders.get(route.params.id as string),
)

const broken = computed(() => isPayloadIntegrityError(error.value))
</script>

<template>
  <main v-if="broken">
    <h1>Something went wrong</h1>
    <p>We could not load this order safely. Please contact support.</p>
  </main>

  <main v-else-if="order">
    <h1>Order {{ order.number }}</h1>
    <p>{{ order.status }}</p>

    <ul>
      <li v-for="line in order.lines" :key="line.id">
        {{ locale === 'ar' ? line.name_ar : line.name_en }} × {{ line.quantity }}
        — {{ formatMoney(line.line_total, 'ar-EG') }}
      </li>
    </ul>

    <dl>
      <dt>Items</dt><dd>{{ formatMoney(order.totals.items_subtotal, 'ar-EG') }}</dd>
      <dt>Delivery</dt><dd>{{ formatMoney(order.totals.delivery_fee, 'ar-EG') }}</dd>
      <dt>Total</dt><dd>{{ formatMoney(order.totals.total, 'ar-EG') }}</dd>
    </dl>

    <p v-if="order.payment?.requires_action">
      This order is not paid yet.
    </p>
  </main>
</template>
```

`isPayloadIntegrityError` catches a real failure here. An order always has at least one line, so
`lines: []` is a lost payload arriving as a valid `200`. The client throws rather than render a
buyer an order that appears to contain nothing.

## Branding

The logo and the icon come from `useStoreInfo()`, already resolved to images:

```ts
const { data: store } = await useStoreInfo()

const logo = computed(() => store.value?.branding.logo ?? null)
```

Both `branding.logo` and `branding.icon` are `null` until the store uploads one, so a theme needs
the `store.name` fallback the [app shell](#the-app-shell) shows. The icon is the square mark, which
is what a favicon or a narrow header wants.

Bind `v-bind="imageSrcSet(logo)"` and keep `logo.alt` as the alternative text. Renditions are empty
in release one, so that renders the original alone for now and folds in the smaller sizes once an
encoder generates them. See [`catalog` → imageSrcSet](/api/catalog#imagesrcset).

Store settings hold `branding.logo_asset_id` and `branding.icon_asset_id`, but those are bare asset
UUIDs and resolve to nothing renderable. Read the images from `useStoreInfo()` and the colours from
settings:

```ts
const { data: settings } = await useStoreSettings()

const primary = (settings.value?.settings['branding.primary_color']?.value as string) ?? '#111827'
const accent = (settings.value?.settings['branding.accent_color']?.value as string) ?? '#111827'
```

Both are plain colour strings. Feed them into CSS custom properties and let the rest of the theme
follow:

```vue
<template>
  <div :style="{ '--brand': primary, '--accent': accent }">
    <slot />
  </div>
</template>
```

## What is missing, and what to build instead

| You might expect | Reality | What to do |
| --- | --- | --- |
| Guest checkout | Not in release one | Put login before the checkout form |
| Wishlist | No endpoint | Local storage, or leave it out |
| Product reviews | No endpoint | Leave it out |
| Related products | No endpoint | Use `filter[category]` on the catalog list |
| Images on search hits | Search returns no image | Render text, or fetch catalog summaries for the visible page |
| Responsive images | Renditions are empty until an encoder ships | Bind `imageSrcSet()` now; it renders the original today and adds sizes later. [Details](/api/catalog#imagesrcset) |
| A variant's display name | Variants carry no label | Derive one from price, SKU or an attribute. [Details](#product-page) |
| A shopper completing verification | Codes are recorded and never delivered, so a new customer cannot place a first order | Nothing on this side fixes it. [Details](/guide/authentication#verify) |

## Next

- [Checkout](/guide/checkout) for the full idempotency and failure story.
- [Composables](/nuxt/composables) for every composable's signature.
- [API reference](/api/store) for the raw client, when a composable does not fit.
