import type { AdministrativeArea, AreasQuery, Paginated } from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { queryKey } from '../internal'
import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

/**
 * `GET /customer/areas`.
 *
 * The query may be a ref or a getter; the list refetches when it changes. The `useAsyncData` key is
 * derived from the query's *initial* shape, so a governorate list and a city list on one address
 * form do not collide.
 *
 * `filter.level` is one level, never a set: the server refuses a comma-joined value with a 422.
 */
export function useAreas(
  query?: MaybeRefOrGetter<AreasQuery | undefined>,
  options: MawjodAsyncOptions = {},
) {
  const api = useMawjodApi()
  const resolved = computed(() => toValue(query))

  return useAsyncData<Paginated<AdministrativeArea>>(
    `mawjod:areas:${queryKey(resolved.value)}`,
    () => api.customer.areas.list(resolved.value),
    { watch: [resolved], ...options },
  )
}
