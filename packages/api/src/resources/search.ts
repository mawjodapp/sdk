import type { Transport } from '../http.js'
import { guardSearchHits } from '../integrity.js'
import type { SearchProductHit, SearchResults } from '../types.js'

/**
 * Search takes flat pagination and no `filter` at all.
 *
 * `filter`, `store_id`, `published` and `in_stock` are *prohibited*. Sending one is a 422, not an
 * ignored parameter. The public index is already scoped to published, in-stock, current-store.
 */
export type SearchProductsQuery = {
  /** Arabic or English, up to 120 characters. An exact SKU or barcode ranks first. */
  q?: string
  category_id?: string
  brand_id?: string
  min_price_minor?: number
  max_price_minor?: number
  /** 1-100. */
  page?: number
  /** 1-60, default 20. */
  per_page?: number
}

export interface SearchNamespace {
  /**
   * Throws `PayloadIntegrityError` when any hit on the page comes back with an empty `slug`: that
   * is a lost projection, not a product without an address.
   */
  products(query?: SearchProductsQuery): Promise<SearchResults<SearchProductHit>>
}

export function createSearchNamespace(transport: Transport): SearchNamespace {
  return {
    products: async (query) => {
      const results = await transport.search<SearchProductHit>({
        method: 'GET',
        path: '/search/products',
        query,
      })

      guardSearchHits(results.data, results.meta)

      return results
    },
  }
}
