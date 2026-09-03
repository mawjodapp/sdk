import type { Transport } from '../http.js'
import type { Banner, Slide } from '../types.js'

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
}

export function createContentNamespace(transport: Transport): ContentNamespace {
  return {
    slider: () => transport.array<Slide>({ method: 'GET', path: '/content/slider' }),
    banners: () => transport.array<Banner>({ method: 'GET', path: '/content/banners' }),
  }
}
