import { describe, expect, it } from 'vitest'

import type { CatalogTaxonomyQuery } from '../src/index.js'
import { createHarness } from './helpers.js'

/** The taxonomy listings share one envelope; only the path and the row differ. */
function taxonomyEnvelope(row: Record<string, unknown>): Record<string, unknown> {
  return {
    data: [row],
    links: {
      first: 'https://shop.test/api/v1/catalog/categories?page=1',
      last: 'https://shop.test/api/v1/catalog/categories?page=1',
      prev: null,
      next: null,
    },
    meta: {
      request_id: 'req-taxonomy',
      current_page: 2,
      per_page: 50,
      last_page: 2,
      total: 63,
    },
  }
}

describe('catalog.categories.list', () => {
  it('sends page and sort and nothing else, and parses the localized envelope', async () => {
    const { client, calls } = createHarness([
      {
        status: 200,
        body: taxonomyEnvelope({
          id: '01920000-0000-7000-8000-000000000010',
          locale: 'ar',
          name: 'أدوات المطبخ',
          slug: 'ادوات-المطبخ',
          image: null,
        }),
      },
    ])

    const page = await client.catalog.categories.list({
      page: { number: 2, size: 50 },
      sort: '-created_at',
    })

    // The whole query string, not one key at a time: this endpoint takes page and sort and nothing
    // else, so a stray parameter slipping through has to fail here.
    expect(decodeURIComponent(calls[0]!.path)).toBe(
      '/api/v1/catalog/categories?page[number]=2&page[size]=50&sort=-created_at',
    )

    // ...and neither refusal can be written in the first place. If either line stops being a type
    // error the seam has been widened and the compile-time half of the guard is gone.
    // @ts-expect-error `sort=name` is a 422: a name only exists inside a locale.
    const named: CatalogTaxonomyQuery = { sort: 'name' }
    // @ts-expect-error there are no filters here. One is ignored today and may be a 422 later.
    const filtered: CatalogTaxonomyQuery = { filter: { category: 'kitchen' } }

    expect(named.sort).toBeDefined()
    expect(filtered.sort).toBeUndefined()

    expect(page.data).toHaveLength(1)
    // One locale, resolved server-side, exactly as `ProductSummary.category` carries it.
    expect(page.data[0]!.locale).toBe('ar')
    expect(page.data[0]!.name).toBe('أدوات المطبخ')
    expect(page.data[0]!.slug).toBe('ادوات-المطبخ')
    // Only the listing row carries an image; `ProductSummary.category` is the plain `Category`.
    expect(page.data[0]!.image).toBeNull()
    expect(page.meta.current_page).toBe(2)
    expect(page.meta.total).toBe(63)
  })
})

describe('catalog.brands.list', () => {
  it('has its own path; the row shape is the one categories already proved', async () => {
    const { client, calls } = createHarness([
      {
        status: 200,
        body: taxonomyEnvelope({
          id: '01920000-0000-7000-8000-000000000011',
          locale: 'en',
          name: 'Tefal',
          slug: 'tefal',
        }),
      },
    ])

    await client.catalog.brands.list()

    expect(calls[0]!.path).toBe('/api/v1/catalog/brands')
  })
})
