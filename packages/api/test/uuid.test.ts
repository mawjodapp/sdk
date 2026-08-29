import { describe, expect, it } from 'vitest'

import { uuidv7 } from '../src/uuid.js'

describe('uuidv7', () => {
  it('pins the version and variant bits and embeds the millisecond clock big-endian', () => {
    const clock = Date.UTC(2026, 7, 18, 12, 0, 0)
    const value = uuidv7(clock)

    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    // The first 48 bits must read back as the exact clock value, which only holds if the
    // timestamp was written big-endian across bytes 0..5.
    const timestamp = Number.parseInt(value.slice(0, 8) + value.slice(9, 13), 16)
    expect(timestamp).toBe(clock)

    // Time ordering is the whole point of v7: later values sort after earlier ones as strings.
    expect(uuidv7(clock + 1000) > value).toBe(true)
    expect(uuidv7(clock - 1000) < value).toBe(true)
  })
})
