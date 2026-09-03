import type { Banner, Slide } from '@mawjod/api'
import { useAsyncData } from '#imports'

import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

/**
 * `GET /content/slider`.
 *
 * Active slides in the vendor's order, already sorted by the server. A store that has not built a
 * slider answers with an empty array, so render the hero conditionally rather than reserving space
 * for slides that may never come.
 */
export function useSlider(options: MawjodAsyncOptions = {}) {
  const api = useMawjodApi()

  return useAsyncData<Slide[]>('mawjod:content:slider', () => api.content.slider(), options)
}

/**
 * `GET /content/banners`.
 *
 * At most one banner per location the store has defined. A location with no active banner is absent
 * from the array, so look one up by its key and render nothing when the lookup misses.
 */
export function useBanners(options: MawjodAsyncOptions = {}) {
  const api = useMawjodApi()

  return useAsyncData<Banner[]>('mawjod:content:banners', () => api.content.banners(), options)
}
