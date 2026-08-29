import { describe, expect, it } from 'vitest'

import { PayloadIntegrityError } from '../src/errors.js'
import { createHarness, money } from './helpers.js'

function hit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'hit-1',
    sku: 'SHIRT-BLUE-M',
    barcode: null,
    name_ar: 'قميص',
    name_en: 'Shirt',
    slug: 'shirt',
    brand: { id: 'brand-1', name: 'Tefal' },
    category: { id: 'category-1', name: 'Kitchen' },
    from_price: money(129900),
    ...overrides,
  }
}

describe('search payload integrity guard', () => {
  it('refuses a page whose hit has an empty slug, carrying that hit id and the request id', async () => {
    const { client } = createHarness([
      {
        status: 200,
        body: {
          // The index projects every field with a fallback, so a hollow row is fully typed: the
          // slug is the only thing that gives it away, and it is the whole address of a product.
          data: [hit(), hit({ id: 'hit-2', slug: '' })],
          links: { first: null, last: null, prev: null, next: null },
          meta: {
            request_id: 'req-hollow-hit',
            current_page: 1,
            per_page: 20,
            last_page: 1,
            total: 2,
            engine: 'meilisearch',
            exhaustive_total: true,
            facets: [],
          },
        },
      },
    ])

    const error = await client.search.products({ q: 'shirt' }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(PayloadIntegrityError)
    expect((error as PayloadIntegrityError).resource).toBe('search_hit')
    // The healthy first row must not mask the unlinkable second one.
    expect((error as PayloadIntegrityError).resourceId).toBe('hit-2')
    expect((error as PayloadIntegrityError).requestId).toBe('req-hollow-hit')
  })
})
