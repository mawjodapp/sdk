import { describe, expect, it } from 'vitest'

import {
  isCheckoutError,
  isMawjodApiError,
  isStoreUnavailable,
  isValidationError,
  MawjodApiError,
  MawjodNetworkError,
} from '../src/errors.js'
import { createHarness, problem } from './helpers.js'

describe('error mapping', () => {
  it('maps a 422 to a validation error with its field bag, and branches on code not status', async () => {
    const { client } = createHarness([
      {
        status: 422,
        contentType: 'application/problem+json',
        body: problem(422, 'validation_failed', {
          errors: { 'lines.0.quantity': ['The quantity must be at least 1.'] },
        }),
      },
    ])

    const error = await client.catalog.products.list().catch((thrown: unknown) => thrown)

    expect(isMawjodApiError(error)).toBe(true)
    expect(isValidationError(error)).toBe(true)
    expect((error as MawjodApiError).errors).toEqual({
      'lines.0.quantity': ['The quantity must be at least 1.'],
    })
    expect((error as MawjodApiError).requestId).toBe('req-problem')
  })

  it('does not treat every 422 as a validation failure', async () => {
    const { client } = createHarness([
      { status: 422, contentType: 'application/problem+json', body: problem(422, 'cart_empty') },
    ])

    const error = await client.catalog.products.list().catch((thrown: unknown) => thrown)

    // Same status, different code. A client that branched on 422 would show a field-error screen
    // for an empty cart.
    expect(isValidationError(error)).toBe(false)
    expect(isCheckoutError(error)).toBe(true)
  })

  it('surfaces store_unavailable through onError as well as the throw', async () => {
    const { client, reported } = createHarness([
      {
        status: 503,
        contentType: 'application/problem+json',
        body: problem(503, 'store_unavailable'),
      },
    ])

    const error = await client.store.get().catch((thrown: unknown) => thrown)

    expect(isStoreUnavailable(error)).toBe(true)
    expect(reported).toHaveLength(1)
    expect(reported[0]).toBe(error)
  })

  it('reports a failure that is not problem+json as a transport error', async () => {
    const { client, reported } = createHarness([
      { status: 502, raw: '<html>Bad Gateway</html>', contentType: 'text/html' },
    ])

    const error = await client.store.get().catch((thrown: unknown) => thrown)

    // No `code`, no `request_id`: there is nothing to branch on, so it must not masquerade as one.
    expect(error).toBeInstanceOf(MawjodNetworkError)
    expect(isMawjodApiError(error)).toBe(false)
    expect((error as MawjodNetworkError).status).toBe(502)
    expect(reported).toHaveLength(0)
  })
})
