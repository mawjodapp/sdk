/**
 * The published declarations, checked the way a consumer meets them.
 *
 * `0.2.0` shipped nine composables as `=> any`: they returned `useAsyncData(...)` directly, and the
 * declaration emit has to infer through `#imports`, a Nuxt virtual module that does not resolve
 * while `nuxt-module-build` writes the `.d.ts`. `pnpm typecheck` stayed green throughout, because
 * `types/nuxt-virtual.d.ts` maps the alias for `tsc --noEmit` — it covers the check, not the emit.
 * Only the artefact shows it, so this test reads the artefact.
 *
 * It runs after `pnpm build`, against whatever `dist/` currently holds.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const distDir = fileURLToPath(new URL('../dist/runtime/composables', import.meta.url))

const BUILD_FIRST = `No declarations under ${distDir}. Run \`pnpm build\` first.`

/**
 * The floor. There are 22 exported composables today; 17 leaves room to retire a few without
 * editing this test, while an empty, half-written or missing `dist/` falls straight through it.
 * Without the floor, the `any` assertion would pass on zero signatures — vacuously green.
 */
const MINIMUM_SIGNATURES = 17

/** `export declare function useX(…): Return;` as the emit writes it: one declaration per line. */
const SIGNATURE = /^export declare function (\w+)\(.*\):\s*(.+);$/

interface Signature {
  file: string
  name: string
  returns: string
}

/**
 * A signature that fails to parse is simply not counted, so a wrapped or reshaped emit shows up as
 * a floor failure rather than as silence.
 */
function readSignatures(): Signature[] {
  let files: string[]

  try {
    files = readdirSync(distDir).filter((name) => name.endsWith('.d.ts'))
  } catch {
    throw new Error(BUILD_FIRST)
  }

  const signatures: Signature[] = []

  for (const file of files) {
    const lines = readFileSync(`${distDir}/${file}`, 'utf8').split('\n')

    for (const line of lines) {
      const match = SIGNATURE.exec(line.trim())
      const name = match?.[1]
      const returns = match?.[2]

      if (name !== undefined && returns !== undefined) {
        signatures.push({ file, name, returns })
      }
    }
  }

  return signatures
}

describe('published composable declarations', () => {
  it('parses at least the floor of exported signatures', () => {
    const signatures = readSignatures()

    expect(
      signatures.length,
      `Parsed too few declarations under ${distDir}. Run \`pnpm build\` first if it is stale.`,
    ).toBeGreaterThanOrEqual(MINIMUM_SIGNATURES)
  })

  it('hands back a real type from every composable', () => {
    const untyped = readSignatures()
      .filter((signature) => /\bany\b/.test(signature.returns))
      .map((signature) => `${signature.file}: ${signature.name} -> ${signature.returns}`)

    expect(untyped, 'these composables give a consumer no types back').toEqual([])
  })
})
