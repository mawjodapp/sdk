# `customer`

The signed-in customer's profile, saved addresses, and the administrative areas an address can
point at. Every call requires an authenticated customer.

```ts
mawjod.customer.profile.get()
mawjod.customer.profile.update(input)
mawjod.customer.addresses.list()
mawjod.customer.addresses.create(input)
mawjod.customer.addresses.update(addressId, input)
mawjod.customer.addresses.remove(addressId)
mawjod.customer.areas.list(query)
```

## `customer.profile.get()`

```ts
get(): Promise<Customer>
```

`GET /api/v1/customer/profile`.

There is no "current session" endpoint, so this doubles as the signed-in check: a `401` means the
session is gone.

```ts
import { isUnauthenticated } from '@mawjod/api'

try {
  const customer = await mawjod.customer.profile.get()
} catch (error) {
  if (isUnauthenticated(error)) {
    // signed out
  } else {
    throw error
  }
}
```

## `customer.profile.update()`

```ts
update(input: UpdateProfileInput): Promise<Customer>
```

`PATCH /api/v1/customer/profile`.

```ts
interface UpdateProfileInput {
  name: string   // required, up to 120 characters
}
```

Only the name is editable. The verified identity is not changeable here, and there is no endpoint
that changes it.

## `customer.addresses.list()`

```ts
list(): Promise<Address[]>
```

`GET /api/v1/customer/addresses`.

Not paginated. It returns a bare array, and the client types it as one so you cannot reach for
`.data` by mistake.

## `customer.addresses.create()`

```ts
create(input: AddressInput): Promise<Address>
```

`POST /api/v1/customer/addresses`. Returns `201`.

## `customer.addresses.update()`

```ts
update(addressId: string, input: AddressInput): Promise<Address>
```

`PUT /api/v1/customer/addresses/{addressId}`.

::: warning This is a full replace, not a patch
`PUT` takes the identical shape as `POST`. Every required field must be present, not just the ones
that changed. Spread the existing address into your form state and send the whole thing back.
:::

```ts
await mawjod.customer.addresses.update(address.id, {
  area_id: address.area!.id,
  label: address.label,
  recipient_name: address.recipient_name,
  recipient_phone: address.recipient_phone,
  line_one: nextLineOne,
  line_two: address.line_two,
  position: address.position!,
  is_default: address.is_default,
})
```

## `customer.addresses.remove()`

```ts
remove(addressId: string): Promise<void>
```

`DELETE /api/v1/customer/addresses/{addressId}`. Answers `204` with no body, so the method resolves
to `void`.

## `customer.areas.list()`

```ts
list(query?: AreasQuery): Promise<Paginated<AdministrativeArea>>
```

`GET /api/v1/customer/areas`. Paginated, with the same envelope as every other list.

This is where an `area_id` comes from. It is the set of administrative areas this store delivers
to, and a theme builds its address form out of it.

```ts
const page = await mawjod.customer.areas.list({
  page: { number: 1, size: 100 },
  sort: 'code',
  filter: { level: 'city', parent: governorateId },
})
```

### Query

```ts
interface AreasQuery {
  page?: { number?: number | null; size?: number | null }
  sort?: string | string[]
  filter?: {
    level?: 'governorate' | 'city' | 'district'
    parent?: string
  }
}
```

| Key | Sent as | Notes |
| --- | --- | --- |
| `page.number`, `page.size` | `page[number]`, `page[size]` | The standard bracket pagination. |
| `sort` | `sort` | `code`, `created_at` or `updated_at`, with a leading `-` for descending. |
| `filter.level` | `filter[level]` | One level. Never a set. |
| `filter.parent` | `filter[parent]` | A single area UUIDv7. Anything else is a `422`. |

`filter[level]` takes one value. `filter[level]=city,district` is refused with a `422`, unlike
`filter[status]` on orders, which does accept a comma-joined set. The SDK types `level` as a single
string, so the comma form cannot be written by accident and never reaches the serializer.

### The item

```ts
interface AdministrativeArea {
  id: string
  level: 'governorate' | 'city' | 'district'
  code: string
  name_ar: string
  name_en: string
  source: string
  parent_id: string | null
  created_at: string
  updated_at: string
}
```

Both names are always present. This list resolves no locale, unlike a catalog product, so pick the
name for the locale you are rendering in.

### The two-call picker

An address form asks for a governorate, then for a city inside it. That is two calls:

```ts
const governorates = await mawjod.customer.areas.list({
  filter: { level: 'governorate' },
  sort: 'code',
})

// once the shopper has picked one
const cities = await mawjod.customer.areas.list({
  filter: { level: 'city', parent: governorateId },
  sort: 'code',
})
```

Send the id of the deepest area the shopper chose as `area_id`. A form that goes down to districts
is the same call once more, with `level: 'district'` and the city's id as `parent`.

### An area from another store is absent, not forbidden

One rule governs both this listing and the `area_id` check on an address, so the two cannot
disagree. An area belonging to another store reads as absent from the list, and its id fails
validation the same way any unknown id does. A theme never sees an area it may not use, and never
has a saved id rejected for a reason it cannot see. There are no `403`s on this surface.

## `AddressInput`

```ts
interface AddressInput {
  area_id: string                  // UUID of a store-owned administrative area
  label: string                    // up to 60
  recipient_name: string           // up to 160
  recipient_phone: string          // E.164, /\A\+[1-9]\d{7,18}\z/, up to 20
  line_one: string                 // up to 200
  line_two?: string | null         // up to 200
  building?: string | null         // up to 60
  floor?: string | null            // up to 30
  apartment?: string | null        // up to 30
  landmark?: string | null         // up to 200
  position: GeoPosition            // { longitude: -180..180, latitude: -90..90 }
  is_default?: boolean
}
```

`area_id` refers to a store-owned administrative area, and both `POST` and `PUT` require it. Get one
from [`customer.areas.list()`](#customer-areas-list). Nothing on the server derives the area from
the position or from the address text, and an existing address's `address.area.id` is only ever a
convenient second source.

The id is validated against the areas this store has. A well-formed but unknown one is
`422 validation_failed` with the message under `errors.area_id`, so a stale id in a form is handled
the same way as a missing label rather than as a server fault.

`is_default` is decided by the server across the whole list: setting it on one address moves the
flag off another. That is why the Nuxt composable refetches after every mutation rather than patching
locally.

## `Address`

```ts
interface Address {
  id: string
  label: string
  recipient_name: string
  recipient_phone: string
  line_one: string
  line_two: string | null
  building: string | null
  floor: string | null
  apartment: string | null
  landmark: string | null
  is_default: boolean
  position: GeoPosition | null
  area: AdministrativeAreaRef | null   // only present when the server loaded the relation
  created_at: string | null
  updated_at: string | null
}

interface AdministrativeAreaRef {
  id: string
  level: string
  code: string
  name_ar: string
  name_en: string
}
```

`area` carries both locales. `position` and `area` are both nullable on the response even though
`position` and `area_id` are required on input, so read them defensively.

## Errors

| Code | Status |
| --- | --- |
| `unauthenticated` | 401 |
| `validation_failed` | 422 |
| `rate_limited` | 429 |
| `store_unavailable` | 503 |

`404 not_found` is not sampled in the generated docs for the by-id address routes, but they use
route-model binding scoped to the signed-in customer, so a foreign or missing id very likely
produces one. Handle it.

Validation error keys use the API's own field names, including nested ones like
`position.longitude`. Name your form inputs to match and the mapping is free.

## In Nuxt

```ts
const { profile, update, updating } = useCustomerProfile()
const { addresses, create, update: updateAddress, remove, mutating } = useAddresses()
const { data: governorates } = await useAreas({ filter: { level: 'governorate' }, sort: 'code' })
```

See [Composables → useCustomerProfile](/nuxt/composables#usecustomerprofile) and
[useAreas](/nuxt/composables#useareas).
