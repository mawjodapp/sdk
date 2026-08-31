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
 * Release one: `renditions` is an empty map on every public image. There is no encoder yet, and the
 * media processor only publishes rendition urls for a processor that reports it produces renderable
 * images, so the map is empty rather than full of urls that are not pictures. Binding this helper
 * today renders the original and nothing else.
 *
 * That is the same path a partially generated image takes, so it needs no special case in a theme.
 * When a real encoder ships the map repopulates and `srcset` starts working, with no change here
 * and none in the code that calls this.
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
