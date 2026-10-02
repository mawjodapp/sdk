import { afterEach, describe, expect, it } from 'vitest'

import { isMawjodApiError, type WinClaimInput, type WinPrize } from '../src/index.js'
import { createHarness, problem, setCookieJar } from './helpers.js'

afterEach(() => setCookieJar(null))

const percentage: WinPrize = { name_ar: 'خصم 15٪', name_en: '15% off', type: 'percentage', value: 1500 }
const fixed: WinPrize = { name_ar: 'خصم 50 جنيه', name_en: 'EGP 50 off', type: 'fixed_amount', value: 5000 }
const attempt = { phone: '+201000000001', code: '7KQ2M9XHRT' }

describe('win campaign', () => {
  it('checks eligibility, then claims, on the win routes', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const product = { id: 'p-1', name_ar: 'زيت زيتون بكر', name_en: 'Extra virgin olive oil' }
    const { client, calls } = createHarness([
      { body: { data: { product }, meta: { request_id: 'r' } } },
      { status: 201, body: { data: { coupon_code: 'WIN-7KQ2M9XHRT', prize: percentage }, meta: { request_id: 'r' } } },
    ])
    const claim: WinClaimInput = { ...attempt, rating: 5, comment: 'Clean taste.' }

    expect(await client.campaign.win.eligibility(attempt)).toEqual({ product })
    expect((await client.campaign.win.claim(claim)).coupon_code).toBe('WIN-7KQ2M9XHRT')
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      ['/api/v1/campaign/win/eligibility', attempt],
      ['/api/v1/campaign/win/claim', claim],
    ])
  })

  it.each([percentage, fixed])('hands the prize back as sent (%o)', async (prize) => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client } = createHarness([
      { status: 201, body: { data: { coupon_code: 'WIN-A', prize }, meta: { request_id: 'r' } } },
    ])

    expect((await client.campaign.win.claim({ ...attempt, rating: 3, comment: '' })).prize).toEqual(prize)
  })

  it('surfaces a refusal by its code and sends a claim exactly once', async () => {
    setCookieJar('XSRF-TOKEN=tok')
    const { client, calls } = createHarness([
      { status: 422, contentType: 'application/problem+json', body: problem(422, 'win_code_not_accepted') },
    ])
    const refused = await client.campaign.win.claim({ ...attempt, rating: 1, comment: 'x' }).catch((e: unknown) => e)

    expect(isMawjodApiError(refused) && refused.code).toBe('win_code_not_accepted')
    expect(calls.filter((call) => call.path.endsWith('/claim'))).toHaveLength(1)
  })

  it('keeps the rating to whole stars', () => {
    // @ts-expect-error a rating is 1 to 5.
    const bad: WinClaimInput = { ...attempt, rating: 6, comment: '' }

    expect(bad.rating).toBe(6)
  })
})
