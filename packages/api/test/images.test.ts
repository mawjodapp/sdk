import { describe, expect, it } from 'vitest'

import { imageSrcSet } from '../src/images.js'
import type { Image } from '../src/types.js'

function image(renditions: Image['renditions']): Image {
  return {
    id: '01920000-0000-7000-8000-000000000001',
    url: 'https://cdn.test/original.jpg',
    alt: null,
    renditions,
  }
}

describe('imageSrcSet', () => {
  it('sorts renditions by width whatever order the map arrived in, and keeps the original as src', () => {
    // `large` first on purpose: a browser reads srcset as a set, but a stable string is what makes
    // this testable and keeps a rendered page byte-identical between requests.
    const built = imageSrcSet(
      image({
        large: { url: 'https://cdn.test/large.jpg', width: 1200, height: 900 },
        thumbnail: { url: 'https://cdn.test/thumb.jpg', width: 200, height: 150 },
      }),
    )

    expect(built.src).toBe('https://cdn.test/original.jpg')
    expect(built.srcset).toBe('https://cdn.test/thumb.jpg 200w, https://cdn.test/large.jpg 1200w')
  })

  it('falls back to the original alone when nothing has been generated yet', () => {
    const built = imageSrcSet(image({}))

    expect(built.src).toBe('https://cdn.test/original.jpg')
    expect(built.srcset).toBe('')
  })
})
