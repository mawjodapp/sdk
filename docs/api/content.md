# `content`

The merchandising surface a theme renders around the catalog: the hero slider, the banners the
store has placed, and the reviews it has chosen to show. All three calls are public, with the same
middleware as the catalog, so a guest sees them without any session.

```ts
mawjod.content.slider()
mawjod.content.banners()
mawjod.content.reviews()
```

All three return bare arrays. None is paginated, and none takes a query.

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
position 0, and a slide goes live only with a picture in that slot (a banner may go live with a
title instead; see below). A wide slide on a
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
  ends_at: string | null
  show_countdown: boolean
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

### Text banners and countdowns

A banner goes live with a picture at position 0 or with a title. One with a title and `image: null`
is a text strip: render the title on your own ground rather than skipping the row.

`ends_at` is when the banner stops showing, ISO 8601, or `null` for one that stays up until the
store switches it off. The API drops a banner from the array once `ends_at` passes, with no change
needed on the store's side. `show_countdown` asks the theme to count down to `ends_at`, and is only
ever `true` when `ends_at` is set. A countdown that reaches zero should take the banner down itself:
the array the page loaded still has it until the next read.

```ts
const strip = banners.find((banner) => banner.location === 'announcement') ?? null
const left = strip?.show_countdown ? Date.parse(strip.ends_at!) - Date.now() : null
```

Count against the visitor's clock, from the server's `ends_at`; there is nothing to sync.

## `content.reviews()`

```ts
reviews(): Promise<Review[]>
```

`GET /api/v1/content/reviews`. The reviews the store has typed in and left showing, in the order it
arranged them.

```ts
interface Review {
  id: string
  author_name: string
  rating: 1 | 2 | 3 | 4 | 5
  body: string
}
```

`body` is shown as it was written whatever the `Accept-Language`, because a quote is not
translated. Set `dir="auto"` on it if your store carries reviews in both languages.

## Empty is the normal state

A store that has not built a slider answers `{ "data": [] }`, and a store with no active banners
or no reviews answers the same. That is a fresh store, not a failure and not a 404.

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
const { data: reviews } = await useReviews()
```

All three wrap `useAsyncData` and run during SSR. See
[Composables → useSlider](/nuxt/composables#useslider).
