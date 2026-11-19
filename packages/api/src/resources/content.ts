import type { Transport } from '../http.js'
import type { Banner, Review, Slide } from '../types.js'

export interface ContentNamespace {
  /**
   * Active slides in the order the vendor arranged them. Not paginated, and public: no session is
   * needed, the same as the catalog.
   *
   * A store that has not built a slider answers with an empty array. That is the normal state of a
   * fresh store, not a failure.
   */
  slider(): Promise<Slide[]>
  /**
   * The active banner for each location the store has defined, at most one per location. Not
   * paginated, and public.
   *
   * A location with no active banner is absent from the array rather than present with a null
   * banner, so look a location up by key and render nothing when it is missing.
   */
  banners(): Promise<Banner[]>
  /**
   * The reviews the store has chosen to show, in its order. Not paginated, and public. An empty
   * array is a store that has added none.
   */
  reviews(): Promise<Review[]>
}

export function createContentNamespace(transport: Transport): ContentNamespace {
  return {
    slider: () => transport.array<Slide>({ method: 'GET', path: '/content/slider' }),
    banners: () => transport.array<Banner>({ method: 'GET', path: '/content/banners' }),
    reviews: () => transport.array<Review>({ method: 'GET', path: '/content/reviews' }),
  }
}
