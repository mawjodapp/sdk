import { describe, expect, it } from 'vitest'

import { buildQuery } from '../src/query.js'

describe('buildQuery', () => {
  it('serializes bracket pagination, sort order and both filter shapes', () => {
    const params = new URLSearchParams(
      buildQuery({
        page: { number: 2, size: 50 },
        sort: ['-placed_at', 'number'],
        filter: {
          status: ['placed', 'confirmed'],
          placed_at: { from: '2026-08-01', to: '2026-08-31' },
          number: 'MW-1',
          q: '',
          order_id: null,
        },
      }),
    )

    expect(params.get('page[number]')).toBe('2')
    expect(params.get('page[size]')).toBe('50')
    // A leading '-' is the API's descending marker and must survive the join.
    expect(params.get('sort')).toBe('-placed_at,number')
    expect(params.get('filter[status]')).toBe('placed,confirmed')
    expect(params.get('filter[placed_at][from]')).toBe('2026-08-01')
    expect(params.get('filter[placed_at][to]')).toBe('2026-08-31')
    expect(params.get('filter[number]')).toBe('MW-1')

    // A cleared search box and an unset filter must not reach the server: the API answers 422
    // for a blank filter value rather than ignoring it.
    expect(params.has('filter[q]')).toBe(false)
    expect(params.has('filter[order_id]')).toBe(false)
  })

  it('serializes search-style flat pagination without bracket keys', () => {
    const params = new URLSearchParams(
      buildQuery({ q: 'shirt', page: 2, per_page: 40, min_price_minor: 0 }),
    )

    expect(params.get('q')).toBe('shirt')
    expect(params.get('page')).toBe('2')
    expect(params.get('per_page')).toBe('40')
    // Zero is a meaningful price bound, not an absent value.
    expect(params.get('min_price_minor')).toBe('0')

    // /search/products rejects bracket pagination and prohibits `filter` outright.
    expect(params.has('page[number]')).toBe(false)
    expect(params.has('page[size]')).toBe(false)
  })
})
