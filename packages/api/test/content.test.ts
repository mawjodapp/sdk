import { describe, expect, it } from 'vitest'

import { createHarness } from './helpers.js'

function image(): Record<string, unknown> {
  return {
    id: '01920000-0000-7000-8000-00000000000a',
    url: 'https://cdn.test/slides/new.webp',
    alt: null,
    renditions: {},
  }
}

describe('content', () => {
  it('reads the slider and the banners as bare arrays, and survives an empty store', async () => {
    const { client, calls } = createHarness([
      {
        status: 200,
        body: {
          data: [
            {
              id: 'slide-1',
              title: 'New arrivals',
              link_url: 'https://shop.test/new',
              image: image(),
            },
            // A slide whose picture has not been stored yet. It still comes back, so a theme that
            // assumes `image` is present renders a broken hero rather than skipping the slide.
            { id: 'slide-2', title: null, link_url: null, image: null },
          ],
          meta: { request_id: 'req-slider' },
        },
      },
      {
        status: 200,
        body: {
          data: [
            {
              id: 'banner-1',
              location: 'home_top',
              title: 'Summer sale',
              link_url: 'https://shop.test/sale',
              image: image(),
            },
          ],
          meta: { request_id: 'req-banners' },
        },
      },
      { status: 200, body: { data: [], meta: { request_id: 'req-empty' } } },
    ])

    const slides = await client.content.slider()
    const banners = await client.content.banners()
    const fresh = await client.content.slider()

    expect(calls.map((call) => call.path)).toEqual([
      '/api/v1/content/slider',
      '/api/v1/content/banners',
      '/api/v1/content/slider',
    ])

    expect(slides).toHaveLength(2)
    expect(slides[0]!.title).toBe('New arrivals')
    expect(slides[0]!.image?.renditions).toEqual({})
    expect(slides[1]!.image).toBeNull()
    expect(slides[1]!.title).toBeNull()

    // The location key, not an index: only one banner per location comes back, and a location with
    // no active banner is absent rather than null.
    expect(banners.map((banner) => banner.location)).toEqual(['home_top'])

    // A fresh store has no slider. An empty array is the answer, not a 404.
    expect(fresh).toEqual([])
  })
})
