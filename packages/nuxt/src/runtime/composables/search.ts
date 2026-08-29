import type { SearchMeta, SearchProductHit, SearchProductsQuery, SearchResults } from '@mawjod/api'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import { useMawjodApi } from './client'

export interface UseProductSearchReturn {
  /** The query the next `search()` will send, merged from every call so far. */
  query: Ref<SearchProductsQuery>
  results: Ref<SearchResults<SearchProductHit> | null>
  hits: ComputedRef<SearchProductHit[]>
  meta: ComputedRef<SearchMeta | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  /** Merges `patch` into the query, runs the search, and stores the results. */
  search: (patch?: SearchProductsQuery) => Promise<SearchResults<SearchProductHit>>
  /** Back to the initial query, with no results. */
  reset: () => void
}

/**
 * `GET /search/products`.
 *
 * Search is a user action rather than page data, so this is invoked, not fetched on setup. Note the
 * endpoint's own contract: it takes flat params (`q`, `category_id`, `brand_id`,
 * `min_price_minor`, `max_price_minor`, `page`, `per_page`) and rejects `filter[…]` entirely.
 */
export function useProductSearch(initial: SearchProductsQuery = {}): UseProductSearchReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:search')
  const query = useMawjodRef<SearchProductsQuery>('mawjod:search:query', () => ({ ...initial }))
  const results = useMawjodRef<SearchResults<SearchProductHit> | null>(
    'mawjod:search:results',
    () => null,
  )

  return {
    query,
    results,
    hits: computed(() => results.value?.data ?? []),
    meta: computed(() => results.value?.meta ?? null),
    pending: task.pending,
    error: task.error,
    search: async (patch) => {
      if (patch !== undefined) {
        query.value = { ...query.value, ...patch }
      }

      const found = await runTask(task, () => api.search.products(query.value))

      results.value = found

      return found
    },
    reset: () => {
      query.value = { ...initial }
      results.value = null
      task.error.value = null
    },
  }
}
