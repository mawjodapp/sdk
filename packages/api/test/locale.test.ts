import { describe, expect, it } from 'vitest'

import { createHarness } from './helpers.js'

const storeBody = {
  data: { id: 'store-1', status: 'open', name: 'Shop', default_locale: 'ar' },
  meta: { request_id: 'req-locale' },
}

describe('locale', () => {
  it('sends the configured locale as Accept-Language, and yields to an explicit header', async () => {
    const none = createHarness([{ status: 200, body: storeBody }])
    await none.client.store.get()
    // Unset means unset: the server picks the store default rather than being told a wrong one.
    expect(none.calls[0]!.headers.get('Accept-Language')).toBeNull()

    const arabic = createHarness([{ status: 200, body: storeBody }], { locale: 'ar' })
    await arabic.client.store.get()
    expect(arabic.calls[0]!.headers.get('Accept-Language')).toBe('ar')

    const overridden = createHarness([{ status: 200, body: storeBody }], {
      locale: 'ar',
      headers: { 'Accept-Language': 'en' },
    })
    await overridden.client.store.get()
    // `locale` is a default. A header the caller supplied wins — reversed precedence would
    // answer 'ar' here and silently serve the wrong language.
    expect(overridden.calls[0]!.headers.get('Accept-Language')).toBe('en')
  })
})
