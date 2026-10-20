import { describe, expect, it } from 'vitest'

import { CATEGORY_PAGE_LIMIT } from '../src/index.js'
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
          parent_id: '01920000-0000-7000-8000-000000000001',
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
    expect(page.data[0]!.parent_id).toBe('01920000-0000-7000-8000-000000000001')
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

describe('catalog.categories.all', () => {
  function pageOf(id: string, current: number, last: number): Record<string, unknown> {
    const envelope = taxonomyEnvelope({ id, locale: 'en', name: id, slug: id, image: null, parent_id: null })
    return { ...envelope, meta: { request_id: 'req', current_page: current, per_page: 100, last_page: last, total: last } }
  }

  it('reads every page, largest page size, and stops at the last one', async () => {
    const { client, calls } = createHarness([
      { status: 200, body: pageOf('clothing', 1, 2) },
      { status: 200, body: pageOf('shirts', 2, 2) },
    ])

    const rows = await client.catalog.categories.all()

    expect(rows.map((row) => row.id)).toEqual(['clothing', 'shirts'])
    expect(calls.map((call) => decodeURIComponent(call.path))).toEqual([
      '/api/v1/catalog/categories?page[number]=1&page[size]=100&sort=created_at',
      '/api/v1/catalog/categories?page[number]=2&page[size]=100&sort=created_at',
    ])
  })

  it('stops at the page cap even if the server keeps saying there is more', async () => {
    const { client, calls } = createHarness([{ status: 200, body: pageOf('loop', 1, 999) }])

    await client.catalog.categories.all()

    expect(calls).toHaveLength(CATEGORY_PAGE_LIMIT)
  })
})
