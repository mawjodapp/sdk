/**
 * UUIDv7 (RFC 9562): a 48-bit big-endian Unix millisecond timestamp followed by 74 random bits,
 * with the version and variant bits pinned. Time-ordered, so the server can index it cheaply.
 *
 * Implemented inline because this package carries no runtime dependencies.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  randomFill(bytes)

  const view = new DataView(bytes.buffer)
  const timestamp = Math.floor(now)

  // 48-bit big-endian millisecond timestamp across bytes 0..5.
  view.setUint32(0, Math.floor(timestamp / 0x10000))
  view.setUint16(4, timestamp % 0x10000)

  // Version 7 in the high nibble of byte 6.
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x70)
  // RFC 9562 variant (0b10) in the top two bits of byte 8.
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)

  let hex = ''
  for (let index = 0; index < 16; index += 1) {
    hex += view.getUint8(index).toString(16).padStart(2, '0')
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function randomFill(bytes: Uint8Array): void {
  const source = globalThis.crypto

  if (source === undefined || typeof source.getRandomValues !== 'function') {
    throw new Error(
      'Web Crypto is unavailable, so @mawjod/api cannot generate the UUIDv7 values the API ' +
        'requires. Use Node 20+ or a browser context.',
    )
  }

  source.getRandomValues(bytes)
}
