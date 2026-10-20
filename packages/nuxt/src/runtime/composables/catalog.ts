import type {
  BrandListItem,
  CatalogProductsQuery,
  CatalogTaxonomyQuery,
  CategoryListItem,
  Paginated,
  Product,
  ProductSummary,
} from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'

import { queryKey } from '../internal'
import type { MawjodAsyncData, MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

/**
 * `GET /catalog/products`.
 *
 * The query may be a ref or a getter; the list refetches when it changes. The `useAsyncData` key is
 * derived from the query's *initial* shape, which keeps two lists on one page apart while keeping
 * one list's key stable across navigations.
 */
export function useProducts(
  query?: MaybeRefOrGetter<CatalogProductsQuery | undefined>,
  options: MawjodAsyncOptions = {},
): MawjodAsyncData<Paginated<ProductSummary>> {
  const api = useMawjodApi()
  const resolved = computed(() => toValue(query))

  return useAsyncData<Paginated<ProductSummary>>(
    `mawjod:catalog:products:${queryKey(resolved.value)}`,
    () => api.catalog.products.list(resolved.value),
    { watch: [resolved], ...options },
  )
}

/** `GET /catalog/products/{slug}`. Refetches when `slug` changes. */
export function useProduct(
  slug: MaybeRefOrGetter<string>,
  options: MawjodAsyncOptions = {},
): MawjodAsyncData<Product> {
  const api = useMawjodApi()
  const resolved = computed(() => toValue(slug))

  return useAsyncData<Product>(
    `mawjod:catalog:product:${resolved.value}`,
    () => api.catalog.products.get(resolved.value),
    { watch: [resolved], ...options },
  )
}

/**
 * `GET /catalog/categories`.
 *
 * The query may be a ref or a getter; the list refetches when it changes. The `useAsyncData` key is
 * derived from the query's *initial* shape.
 *
 * The server sorts by `created_at` only, so a nav orders itself: sort the rows by `name` with
 * `localeCompare` in the locale you are rendering. The list is flat: categories have no hierarchy.
 *
 * Rows are `CategoryListItem`: a `Category` plus an `image`, which is `null` when the category has
 * no picture. The `category` on a product summary is a plain `Category` and never carries one.
 */
export function useCategories(
  query?: MaybeRefOrGetter<CatalogTaxonomyQuery | undefined>,
  options: MawjodAsyncOptions = {},
): MawjodAsyncData<Paginated<CategoryListItem>> {
  const api = useMawjodApi()
  const resolved = computed(() => toValue(query))

  return useAsyncData<Paginated<CategoryListItem>>(
    `mawjod:categories:${queryKey(resolved.value)}`,
    () => api.catalog.categories.list(resolved.value),
    { watch: [resolved], ...options },
  )
}

/**
 * Every listed category, all pages, for a navigation that needs the whole tree. Build the tree
 * with `categoryTree` and a breadcrumb with `categoryAncestors` from `@mawjod/api`. One key for
 * the whole app, so a header and a page that both call it share one read.
 */
export function useAllCategories(options: MawjodAsyncOptions = {}): MawjodAsyncData<CategoryListItem[]> {
  const api = useMawjodApi()

  return useAsyncData<CategoryListItem[]>('mawjod:categories:all', () => api.catalog.categories.all(), options)
}

/**
 * `GET /catalog/brands`.
 *
 * The same contract as `useCategories`: page and a `created_at` sort, no filters, and only brands
 * that have at least one visible product behind them. Rows are `BrandListItem`, a `Brand` plus an
 * `image`.
 */
export function useBrands(
  query?: MaybeRefOrGetter<CatalogTaxonomyQuery | undefined>,
  options: MawjodAsyncOptions = {},
): MawjodAsyncData<Paginated<BrandListItem>> {
  const api = useMawjodApi()
  const resolved = computed(() => toValue(query))

  return useAsyncData<Paginated<BrandListItem>>(
    `mawjod:brands:${queryKey(resolved.value)}`,
    () => api.catalog.brands.list(resolved.value),
    { watch: [resolved], ...options },
  )
}
