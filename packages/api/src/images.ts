import type { Image } from './types.js'

/** What an `<img>` needs: a `src` attribute and a `srcset` attribute. */
export interface ImageSrcSet {
  src: string
  srcset: string
}

/**
 * Builds `src` and `srcset` attributes from an image.
 *
 * `src` is always the original url, which is the largest thing available and the one asset that is
 * always there. `srcset` lists whatever renditions the server generated, each as `url width`,
 * sorted narrowest first so the output is stable between calls.
 *
 * The rendition keys are read off the image rather than assumed, so a store whose thumbnails have
 * not been generated yet gets a shorter list instead of a broken url, and a size added later
 * appears on its own. An image with no renditions gets an empty `srcset`, which browsers ignore.
 *
 * Until backend v1.4.0 `renditions` was an empty map on every public image: the release-one
 * processor wrote placeholders and the API withheld their urls. Since then every image carries
 * `thumbnail`, `medium` and `large` as WebP at 160, 640 and 1280 on the longest side. A store
 * that uploaded before the encoder keeps `{}` until its operator runs `mawjod:media:reprocess`,
 * which is the same path a partially generated image takes, and this helper needs no special case.
 */
export function imageSrcSet(image: Image): ImageSrcSet {
  const renditions = Object.values(image.renditions ?? {})
    .slice()
    .sort((a, b) => a.width - b.width)

  return {
    src: image.url,
    srcset: renditions.map((rendition) => `${rendition.url} ${rendition.width}w`).join(', '),
  }
}
