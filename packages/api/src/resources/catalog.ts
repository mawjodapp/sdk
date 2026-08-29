import type { Transport } from '../http.js'
import type { SortValue } from '../query.js'
import type {
  BrandListItem,
  CategoryListItem,
  Paginated,
  Product,
  ProductSummary,
} from '../types.js'

export type CatalogProductsQuery = {
  page?: { number?: number | null; size?: number | null }
  /** `published_at` or `created_at`, optionally `-` prefixed. */
  sort?: SortValue
  /**
   * Only `category` and `brand` are accepted, both by slug. A slug does not vary by locale, so the
   * same value narrows the list under `ar` and `en`. Any other key is a 422.
   */
  filter?: {
    category?: string | null
    brand?: string | null
  }
}

/**
 * The query both taxonomy listings take.
 *
 * There is no `filter` key, on purpose: neither endpoint has filters. The server accepts and
 * silently ignores `filter[…]` on them today, which is a seam rather than a feature and may become
 * a 422 later, so the SDK makes one unwritable instead of passing it through.
 */
export type CatalogTaxonomyQuery = {
  page?: { number?: number | null; size?: number | null } | null
  /**
   * `created_at` only, optionally `-` prefixed. `sort=name` is a 422 — a name only exists inside a
   * locale, so the server refuses to sort by one. Order by name client-side, in the locale you are
   * rendering; that is the intended pattern for a nav.
   */
  sort?: 'created_at' | '-created_at' | null
}

export interface CatalogNamespace {
  products: {
    list(query?: CatalogProductsQuery): Promise<Paginated<ProductSummary>>
    /** Public product detail is addressed by slug, not by id. One slug answers under every locale. */
    get(slug: string): Promise<Product>
  }
  categories: {
    /**
     * Every category with at least one visible product. The listing applies the same visibility
     * predicate as the public product list, so a `slug` from here, used as `filter[category]` on
     * `products.list`, always returns at least one product.
     *
     * Rows are `CategoryListItem`, which is a `Category` plus an `image`. Only the listing carries
     * one; the `category` embedded in a product summary does not.
     */
    list(query?: CatalogTaxonomyQuery): Promise<Paginated<CategoryListItem>>
  }
  brands: {
    /** Every brand with at least one visible product. Same rules as `categories.list`. */
    list(query?: CatalogTaxonomyQuery): Promise<Paginated<BrandListItem>>
  }
}

export function createCatalogNamespace(transport: Transport): CatalogNamespace {
  return {
    products: {
      list: (query) =>
        transport.list<ProductSummary>({ method: 'GET', path: '/catalog/products', query }),
      get: (slug) =>
        transport.data<Product>({
          method: 'GET',
          path: `/catalog/products/${encodeURIComponent(slug)}`,
        }),
    },
    categories: {
      list: (query) =>
        transport.list<CategoryListItem>({ method: 'GET', path: '/catalog/categories', query }),
    },
    brands: {
      list: (query) =>
        transport.list<BrandListItem>({ method: 'GET', path: '/catalog/brands', query }),
    },
  }
}
