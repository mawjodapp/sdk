import { describe, expect, it } from 'vitest'

import { createHarness } from './helpers.js'

function image(name = 'new'): Record<string, unknown> {
  return {
    id: `01920000-0000-7000-8000-00000000000${name === 'new' ? 'a' : 'b'}`,
    url: `https://cdn.test/slides/${name}.webp`,
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
              mobile_image: image('new-tall'),
            },
            // A slide whose picture has not been stored yet. It still comes back, so a theme that
            // assumes `image` is present renders a broken hero rather than skipping the slide.
            { id: 'slide-2', title: null, link_url: null, image: null, mobile_image: null },
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
              mobile_image: null,
              ends_at: null,
              show_countdown: false,
            },
            // A text strip counting down: no picture, an end, and the countdown on.
            {
              id: 'banner-2',
              location: 'announcement',
              title: 'Black Friday',
              link_url: null,
              image: null,
              mobile_image: null,
              ends_at: '2026-11-28T22:00:00+00:00',
              show_countdown: true,
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

    // The tall picture for phones rides along when the vendor attached one, and is null, not
    // absent, when they did not; both shapes pass through untouched.
    expect(slides[0]!.mobile_image?.url).toBe('https://cdn.test/slides/new-tall.webp')
    expect(slides[1]!.mobile_image).toBeNull()
    expect(banners[0]!.mobile_image).toBeNull()

    // The location key, not an index: only one banner per location comes back, and a location with
    // no active banner is absent rather than null.
    expect(banners.map((banner) => banner.location)).toEqual(['home_top', 'announcement'])
    expect(banners[1]!.image).toBeNull()
    expect(banners[1]!.show_countdown).toBe(true)
    expect(Date.parse(banners[1]!.ends_at!)).toBe(Date.UTC(2026, 10, 28, 22))

    // A fresh store has no slider. An empty array is the answer, not a 404.
    expect(fresh).toEqual([])
  })

  it('reads the reviews the store chose to show, in its order', async () => {
    const { client, calls } = createHarness([
      {
        status: 200,
        body: {
          data: [
            { id: 'review-1', author_name: 'سارة م.', rating: 5, body: 'أنقى زيت جربته.' },
            { id: 'review-2', author_name: 'Omar K.', rating: 4, body: 'Arrived in two days.' },
          ],
          meta: { request_id: 'req-reviews' },
        },
      },
    ])

    const reviews = await client.content.reviews()

    expect(calls.map((call) => call.path)).toEqual(['/api/v1/content/reviews'])
    expect(reviews.map((review) => review.id)).toEqual(['review-1', 'review-2'])
    expect(reviews[0]!.rating).toBe(5)
  })
})
