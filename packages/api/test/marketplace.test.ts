import { afterEach, describe, expect, it } from 'vitest'

import {
  isMawjodApiError,
  MarketplaceSettingKey,
  VendorRegistration,
  VendorStatus,
  type VendorSignupInput,
} from '../src/index.js'
import { createHarness, problem, setCookieJar } from './helpers.js'

afterEach(() => setCookieJar(null))

const application: VendorSignupInput = {
  email: 'owner@niletextiles.example',
  code: '482913',
  owner_name: 'Mona Adel',
  name_ar: 'منسوجات النيل',
  name_en: 'Nile Textiles',
  contact_email: 'sales@niletextiles.example',
  contact_phone: '+201000000002',
  area_id: '01916f7a-bcde-7abc-8def-3123456789ab',
  address_line: '12 Industrial Zone, Block 4',
  legal_name: 'Nile Textiles for Trading S.A.E.',
  commercial_register_no: 'CR-123456',
  tax_registration_no: '123-456-789',
}

describe('vendor signup', () => {
  it('sends the code, then files the application, on the marketplace routes', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client, calls } = createHarness([
      { status: 202, body: { data: { sent: true }, meta: { request_id: 'r' } } },
      { status: 201, body: { data: { id: 'v-1', status: 'pending' }, meta: { request_id: 'r' } } },
    ])

    await expect(client.marketplace.vendorSignup.sendCode({ email: application.email })).resolves.toBeUndefined()
    const filed = await client.marketplace.vendorSignup.apply(application)

    expect(filed).toEqual({ id: 'v-1', status: VendorStatus.Pending })
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ['POST', '/api/v1/marketplace/vendor-signup/code', { email: application.email }],
      ['POST', '/api/v1/marketplace/vendor-signup', application],
    ])
  })

  it('lists the areas a business can be in', async () => {
    const { client, calls } = createHarness([
      { body: { data: [], meta: { request_id: 'r', page: { number: 1, size: 50, total: 0 } } } },
    ])

    await client.marketplace.vendorSignup.areas({ filter: { level: 'governorate' } })

    expect(calls[0]?.path).toBe('/api/v1/marketplace/vendor-signup/areas?filter%5Blevel%5D=governorate')
  })

  it.each(['vendor_registration_closed', 'vendor_signup_code_invalid', 'vendor_email_unavailable'])(
    'surfaces %s by its code',
    async (code) => {
      setCookieJar('XSRF-TOKEN=tok')
      const { client } = createHarness([
        { status: 422, contentType: 'application/problem+json', body: problem(422, code) },
      ])
      const refused = await client.marketplace.vendorSignup.apply(application).catch((e: unknown) => e)

      expect(isMawjodApiError(refused) && refused.code).toBe(code)
    },
  )

  it('names the statuses and the registration setting', () => {
    expect(Object.values(VendorStatus)).toEqual(['pending', 'approved', 'rejected', 'suspended'])
    expect(Object.values(VendorRegistration)).toEqual(['open', 'closed'])
    expect(MarketplaceSettingKey.VendorRegistration).toBe('marketplace.vendor_registration')
  })
})

describe('seller page', () => {
  const vendor = {
    id: 'v-1',
    slug: 'palm-store',
    name_ar: 'متجر النخيل',
    name_en: 'Palm Store',
    about_ar: null,
    about_en: 'Dates and oils.',
    area: { id: 'a-1', name_ar: 'الجيزة', name_en: 'Giza' },
    logo: null,
  }

  it('reads a seller by slug, and its products through the catalog filter', async () => {
    const { client, calls } = createHarness([
      { body: { data: vendor, meta: { request_id: 'r' } } },
      { body: { data: [], meta: { request_id: 'r', page: { number: 1, size: 24, total: 0 } } } },
    ])

    await expect(client.marketplace.vendors.get('palm store')).resolves.toEqual(vendor)
    await client.catalog.products.list({ filter: { vendor: 'palm-store' } })

    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ['GET', '/api/v1/marketplace/vendors/palm%20store'],
      ['GET', '/api/v1/catalog/products?filter%5Bvendor%5D=palm-store'],
    ])
  })

  it('surfaces a seller that is not selling as not found', async () => {
    const { client } = createHarness([{ status: 404, body: problem(404, 'not_found') }])

    const failure = await client.marketplace.vendors.get('gone').catch((error: unknown) => error)

    expect(isMawjodApiError(failure) && failure.status).toBe(404)
  })
})
