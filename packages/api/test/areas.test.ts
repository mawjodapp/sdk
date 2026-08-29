import { describe, expect, it } from 'vitest'

import type { AreasQuery } from '../src/index.js'
import { createHarness } from './helpers.js'

const GOVERNORATE_ID = '01920000-0000-7000-8000-000000000001'

function areaPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '01920000-0000-7000-8000-000000000002',
    level: 'city',
    code: 'EG-C-NASR',
    name_ar: 'مدينة نصر',
    name_en: 'Nasr City',
    source: 'seed',
    parent_id: GOVERNORATE_ID,
    created_at: '2026-08-01T00:00:00+00:00',
    updated_at: '2026-08-01T00:00:00+00:00',
    ...overrides,
  }
}

describe('customer.areas.list', () => {
  it('sends a single-valued level and parent filter, and parses the paginated envelope', async () => {
    const { client, calls } = createHarness([
      {
        status: 200,
        body: {
          data: [areaPayload()],
          links: {
            first: 'https://shop.test/api/v1/customer/areas?page=1',
            last: 'https://shop.test/api/v1/customer/areas?page=2',
            prev: null,
            next: 'https://shop.test/api/v1/customer/areas?page=2',
          },
          meta: {
            request_id: 'req-areas',
            current_page: 2,
            per_page: 50,
            last_page: 2,
            total: 63,
          },
        },
      },
    ])

    const page = await client.customer.areas.list({
      page: { number: 2, size: 50 },
      sort: 'code',
      filter: { level: 'city', parent: GOVERNORATE_ID },
    })

    // The whole query string, not one key at a time: `filter[level]` is single-valued, and a
    // comma-joined `city,district` is a 422, so a set slipping through has to fail here.
    expect(decodeURIComponent(calls[0]!.path)).toBe(
      '/api/v1/customer/areas' +
        '?page[number]=2&page[size]=50&sort=code' +
        `&filter[level]=city&filter[parent]=${GOVERNORATE_ID}`,
    )

    // ...and it cannot be written in the first place. If this line stops being a type error, the
    // seam has been widened and the compile-time half of the guard is gone.
    // @ts-expect-error `filter[level]` takes one level, never a set.
    const refused: AreasQuery = { filter: { level: ['city', 'district'] } }

    expect(refused.filter?.level).toBeDefined()

    expect(page.data).toHaveLength(1)
    // Both names, always. This list resolves no locale, unlike a catalog product.
    expect(page.data[0]!.name_ar).toBe('مدينة نصر')
    expect(page.data[0]!.name_en).toBe('Nasr City')
    expect(page.data[0]!.parent_id).toBe(GOVERNORATE_ID)
    expect(page.meta.current_page).toBe(2)
    expect(page.meta.total).toBe(63)
    expect(page.links.next).toBe('https://shop.test/api/v1/customer/areas?page=2')
  })
})
