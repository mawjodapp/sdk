# `content`

The merchandising surface a theme renders around the catalog: the hero slider and the banners the
store has placed. Both calls are public, with the same middleware as the catalog, so a guest sees
them without any session.

```ts
mawjod.content.slider()
mawjod.content.banners()
```

Both return bare arrays. Neither is paginated, and neither takes a query.

`title` is localized by `Accept-Language`, the same as a catalog name: ask for `ar` and you get the
Arabic caption, ask for `en` and you get the English one. A caption the store filled in only one
language falls back to the other rather than coming back blank.

## `content.slider()`

```ts
slider(): Promise<Slide[]>
```

`GET /api/v1/content/slider`. Active slides in the order the vendor arranged them. The server has
already sorted them, so render the array as it arrives.

```ts
interface Slide {
  id: string
  title: string | null
  link_url: string | null
  image: Image | null
}
```

```ts
const slides = await mawjod.content.slider()
```

## `content.banners()`

```ts
banners(): Promise<Banner[]>
```

`GET /api/v1/content/banners`. At most one active banner per location the store has defined.

```ts
interface Banner {
  id: string
  location: string
  title: string | null
  link_url: string | null
  image: Image | null
}
```

`location` is the store's own slug key, `home_top` for example. It is defined per store rather than
by the API, so it is an open string and not an enum. Look a location up by key:

```ts
const banners = await mawjod.content.banners()
const homeTop = banners.find((banner) => banner.location === 'home_top') ?? null
```

A location with no active banner is absent from the array. It is not present with a `null` banner,
so a lookup that misses is the signal to render nothing in that slot.

## Empty is the normal state

A store that has not built a slider answers `{ "data": [] }`, and a store with no active banners
answers the same. That is a fresh store, not a failure and not a 404.

Render both conditionally. A hero region that reserves its height before the array arrives leaves a
hole on every store that never fills it.

## Images

`image` is the same [`Image`](/api/types#images) the catalog returns, `renditions` included, and it
is `null` when no picture has been stored yet. A slide or a banner without one still comes back, so
a theme that assumes a picture renders a broken hero instead of skipping the row.

```vue
<img v-if="slide.image" v-bind="imageSrcSet(slide.image)" :alt="slide.image.alt ?? slide.title ?? ''">
```

[`imageSrcSet()`](/api/catalog#imagesrcset) applies here for the same reason it applies to a product
photo: it binds `src` and `srcset` together, renders the original while renditions are empty, and
picks up the generated sizes later without a change on your side.

`link_url` is `null` for a slide or banner that is decoration rather than a link. Render the image
without an anchor in that case.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `validation_failed` | 422 | both, on an `Accept-Language` that is neither `ar` nor `en` |
| `rate_limited` | 429 | both |
| `store_unavailable` | 503 | both |

There is no `404` and no empty-state error. See [Errors](/api/errors).

## In Nuxt

```ts
const { data: slides } = await useSlider()
const { data: banners } = await useBanners()
```

Both wrap `useAsyncData` and run during SSR. See
[Composables → useSlider](/nuxt/composables#useslider).
