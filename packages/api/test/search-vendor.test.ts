import { describe, expect, it } from 'vitest'

import { SearchFacetField, searchFacet } from '../src/index.js'
import { createHarness } from './helpers.js'

const meta = {
  request_id: 'req-seller',
  current_page: 1,
  per_page: 20,
  last_page: 1,
  total: 0,
  engine: 'meilisearch',
  exhaustive_total: true,
  facets: [
    { field: 'category_id', values: [{ value: 'category-1', count: 3 }] },
    {
      field: 'vendor_id',
      values: [
        { value: 'vendor-a', count: 2, vendor: { slug: 'palm-store', name_ar: 'متجر النخيل', name_en: 'Palm Store' } },
      ],
    },
  ],
}

describe('search by seller', () => {
  it('sends the seller slug as a flat parameter', async () => {
    const { client, calls } = createHarness([
      { status: 200, body: { data: [], links: { first: null, last: null, prev: null, next: null }, meta } },
    ])

    await client.search.products({ q: 'dates', vendor: 'palm-store' })

    expect(calls[0]!.path).toBe('/api/v1/search/products?q=dates&vendor=palm-store')
  })

  it('reads the seller facet with its names', async () => {
    const { client } = createHarness([
      { status: 200, body: { data: [], links: { first: null, last: null, prev: null, next: null }, meta } },
    ])

    const results = await client.search.products({ q: 'dates' })

    expect(searchFacet(results.meta, SearchFacetField.Vendor)?.values[0]?.vendor?.name_en).toBe('Palm Store')
    expect(searchFacet(results.meta, SearchFacetField.Brand)).toBeNull()
    expect(searchFacet(null, SearchFacetField.Vendor)).toBeNull()
  })
})
