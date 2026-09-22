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
  mobile_image: Image | null
}
```

```ts
const slides = await mawjod.content.slider()
```

`mobile_image` is the tall picture for phones: the stored asset at position 1 in the slide's media,
or `null` when no picture sits there. Position decides, not upload order. `image` is the asset at
position 0, and a slide or banner goes live only with a picture in that slot. A wide slide on a
phone is a strip nobody can read, so a theme that has a tall picture should use it below its tablet
breakpoint and fall back to `image` otherwise:

```vue
<picture>
  <source v-if="slide.mobile_image" media="(max-width: 767px)" v-bind="pictureSource(slide.mobile_image)" />
  <img v-bind="imageSrcSet(slide.image)" :alt="slide.image.alt ?? slide.title ?? ''" />
</picture>
```

where `pictureSource` is `imageSrcSet` read as `{ srcset }` for a `<source>`; the helper's `srcset`
is what a `<source>` wants, and its `src` is ignored there.

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
  mobile_image: Image | null
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

A store can declare the slot keys its theme looks up in the public setting `theme.banner_slots`, a
list of `{ key, name_ar, name_en }`. Whoever installs a theme sets it, and from then on the
dashboard offers those keys as a list and the API refuses a location under any other key. Read it
through `store.settings()` if your theme wants to check the store was set up for it; a store that
never declared any answers `[]` and accepts any key, which is how every store begins.

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
