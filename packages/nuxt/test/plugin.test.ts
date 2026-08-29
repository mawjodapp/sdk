import type { CartTokenStorage, MawjodClient } from '@mawjod/api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'

import mawjodPlugin from '../src/runtime/plugin'
import { useStoreAvailability } from '../src/runtime/composables/store'
import { cartFixture, jsonResponse, type RecordedCall, stubFetch } from './helpers'
import { type MockNuxtApp, nuxtHarness, resetNuxt } from './nuxt-imports'

interface Provided {
  provide: {
    mawjod: MawjodClient
    mawjodCartTokenStorage: CartTokenStorage
  }
}

const runPlugin = mawjodPlugin as unknown as (nuxtApp: MockNuxtApp) => Provided

function install(): MawjodClient {
  const harness = nuxtHarness()
  const provided = runPlugin(harness.nuxtApp)

  // Nuxt turns `provide` into `$`-prefixed properties on the app; do the same so the composables
  // that read them work against this app instance.
  harness.nuxtApp['$mawjod'] = provided.provide.mawjod
  harness.nuxtApp['$mawjodCartTokenStorage'] = provided.provide.mawjodCartTokenStorage

  return provided.provide.mawjod
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the module plugin', () => {
  let calls: RecordedCall[]

  beforeEach(() => {
    calls = stubFetch(() => jsonResponse(200, { data: cartFixture(0) }))
  })

  it('builds the client against the apiBase and locale in runtimeConfig', async () => {
    resetNuxt({ runtimeConfig: { mawjod: { apiBase: 'https://shop.test', locale: 'ar' } } })

    await install().store.get()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://shop.test/api/v1/store')
    expect(calls[0]!.headers.get('accept-language')).toBe('ar')
  })

  it('forwards the incoming cookie header while rendering on the server', async () => {
    resetNuxt({
      ssr: true,
      runtimeConfig: { mawjod: { apiBase: 'https://shop.test', locale: '' } },
      requestHeaders: { cookie: 'mawjod_session=abc; XSRF-TOKEN=xyz', 'user-agent': 'curl' },
    })

    await install().store.get()

    expect(calls[0]!.headers.get('cookie')).toBe('mawjod_session=abc; XSRF-TOKEN=xyz')
    // Only the cookie is asked for: forwarding the whole incoming header set would leak
    // `host`, `accept-encoding` and friends into a different origin's request.
    expect(nuxtHarness().requestHeaderCalls).toEqual([['cookie']])
  })

  it('forwards nothing in the browser, where the cookie jar does the work', async () => {
    resetNuxt({
      ssr: false,
      runtimeConfig: { mawjod: { apiBase: 'https://shop.test', locale: '' } },
      requestHeaders: { cookie: 'mawjod_session=abc' },
    })

    await install().store.get()

    expect(calls[0]!.headers.get('cookie')).toBeNull()
    expect(nuxtHarness().requestHeaderCalls).toEqual([])
  })
})

describe('store availability', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flips on store_unavailable, ignores other failures, and reset() restores it', async () => {
    resetNuxt({ runtimeConfig: { mawjod: { apiBase: 'https://shop.test', locale: '' } } })

    let next: Response = jsonResponse(503, {
      code: 'store_unavailable',
      status: 503,
      title: 'The shop is paused',
      detail: 'Back shortly.',
      request_id: 'req-503',
    })

    stubFetch(() => next)

    const client = install()
    const availability = useStoreAvailability()

    expect(availability.available.value).toBe(true)

    await expect(client.store.get()).rejects.toThrow()

    expect(availability.available.value).toBe(false)
    expect(availability.detail.value).toBe('Back shortly.')
    expect(availability.requestId.value).toBe('req-503')

    availability.reset()
    expect(availability.available.value).toBe(true)

    next = jsonResponse(422, { code: 'validation_failed', status: 422, errors: { q: ['bad'] } })

    await expect(client.store.get()).rejects.toThrow()

    // A validation failure is not an outage; the "shop paused" screen must stay away.
    expect(availability.available.value).toBe(true)
  })
})
