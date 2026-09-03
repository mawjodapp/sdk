# `store`

The public store profile and the public settings catalogue. Both are unauthenticated.

There is no store selector. Query parameters, headers and host input cannot select another store;
it is resolved once from the deployment's own configuration.

```ts
mawjod.store.get()
mawjod.store.settings()
```

## `store.get()`

```ts
get(): Promise<StoreInfo>
```

`GET /api/v1/store`.

```ts
const store = await mawjod.store.get()
```

```ts
interface StoreInfo {
  id: string
  status: string          // e.g. 'draft'
  name: string            // already localized by the server
  default_locale: 'ar' | 'en'
  branding: {
    logo: Image | null
    icon: Image | null
  }
}
```

`name` is resolved from `Accept-Language`, so it changes with the client's `locale` option.

`branding.logo` and `branding.icon` are resolved images, the same [`Image`](/api/types#images) shape
the catalog returns, renditions and all. Either is `null` when the store has not set one, so keep a
fallback to `name`. See [Branding](#branding) below.

`default_locale` is the store's own default, which is what the API falls back to when you send no
`Accept-Language`. It is not necessarily the locale of the response you are holding; read
`Product.locale` for that.

## `store.settings()`

```ts
settings(): Promise<StoreSettings>
```

`GET /api/v1/store/settings`. Public-audience keys only.

```ts
const { settings } = await mawjod.store.settings()
```

```ts
interface StoreSettings {
  settings: Record<string, StoreSettingEntry>
}

interface StoreSettingEntry {
  type: string
  value: unknown
  mutable: boolean
  audience: string
  schema_version: number
  existing_record_effect: string
}
```

The map is keyed by setting name. `value` is `unknown` on purpose: the settings catalogue is
open-ended and each key has its own shape, so the client does not pretend to know them all. Narrow
at the point of use and provide a fallback:

```ts
const entry = settings['checkout.allowed_payment_methods']
const methods = Array.isArray(entry?.value) ? (entry.value as string[]) : ['cod']
```

### Payment methods

```ts
settings['checkout.allowed_payment_methods'] // string[]
```

This is the only correct source for which payment methods to render. `payment_method` on checkout is
not an enum: `cod` is always offered, `paymob` only when the deployment has the gateway configured,
and a future method needs no SDK release.

A fulfillment quote carries its own `allowed_payment_methods`, narrowed to that delivery zone or
pickup location. When you have a quote, prefer it. See [`fulfillment`](/api/fulfillment).

### Verification

```ts
settings['auth.customer_verification_required'] // boolean
```

Off by default. While it is off, an unverified customer signs in, orders and resets a password like
anyone else, and `identity.verified_at: null` is a normal state on a live session. Read this key
before surfacing any verification UX, and treat a missing key as off:

```ts
const requiresVerification = settings['auth.customer_verification_required']?.value === true
```

When a store turns it on, `checkout.place()` answers `403 customer_not_verified` until the identity
is verified. See [Authentication → verification](/guide/authentication#verification).

### Branding

The colours live in settings:

```ts
settings['branding.primary_color'] // string, e.g. '#111827'
settings['branding.accent_color']  // string
```

Both are plain colour strings with defaults like `#111827`.

The logo and the icon do not. `store.settings()` carries `branding.logo_asset_id` and
`branding.icon_asset_id`, and those hold a bare asset UUID and resolve to nothing you can put in an
`<img>`. The resolved images are on `store.get()` instead, as `branding.logo` and `branding.icon`.
Render them like any other image:

```ts
const [store, { settings }] = await Promise.all([mawjod.store.get(), mawjod.store.settings()])

const brand = {
  name: store.name,
  logo: store.branding.logo?.url ?? null,
  primary: (settings['branding.primary_color']?.value as string) ?? '#111827',
  accent: (settings['branding.accent_color']?.value as string) ?? '#111827',
}
```

`branding.logo` is `null` when the store has not uploaded one, which is the case a theme has to
handle: show `store.name` as the brand mark instead. `branding.icon` is the square mark, for a
favicon or a compact header.

This flattens the logo to a single url because `brand` holds plain strings. When you are filling an
`<img>`, reach for [`imageSrcSet`](/api/catalog#imagesrcset) instead: it gives you `src` and
`srcset` together, and it keeps working unchanged once renditions are generated.

What staff can write is still checked. An asset id has to name a store-owned, public, fully-uploaded
media asset; a product photo, a pending upload, or an unknown id is refused with a 422.

## Errors

| Code | Status |
| --- | --- |
| `validation_failed` | 422 |
| `rate_limited` | 429 |
| `store_unavailable` | 503 |

See [Errors](/api/errors).

## In Nuxt

```ts
const { data: store } = await useStoreInfo()
const { data: settings } = await useStoreSettings()
```

Both wrap `useAsyncData` and run during SSR. See
[Composables → useStoreInfo](/nuxt/composables#usestoreinfo).
