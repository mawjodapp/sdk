import { describe, expect, it } from 'vitest'

import { StoreMode } from '../src/index.js'
import type { StoreInfo } from '../src/index.js'
import { createHarness } from './helpers.js'

const base: Omit<StoreInfo, 'delivery_estimate'> = {
  id: 'store-1',
  status: 'active',
  name: 'Shop',
  default_locale: 'ar',
  mode: StoreMode.Single,
  branding: { logo: null, icon: null },
}

const withZones: StoreInfo = {
  ...base,
  delivery_estimate: {
    minimum_minutes: 60,
    maximum_minutes: 180,
    unit: 'hour',
    minimum: 1,
    maximum: 3,
  },
}

const noZones: StoreInfo = { ...base, delivery_estimate: null }

describe('store profile', () => {
  it.each([withZones, noZones])('hands back delivery_estimate as sent: an estimate or null', async (store) => {
    const { client } = createHarness([
      { status: 200, body: { data: store, meta: { request_id: 'req-store' } } },
    ])

    expect((await client.store.get()).delivery_estimate).toEqual(store.delivery_estimate)
  })
})
