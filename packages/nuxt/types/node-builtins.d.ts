/**
 * The slice of Node's builtins the declaration test uses, for this package only.
 *
 * `@types/node` is not a dependency here, and adding one for a single test would be the wrong
 * trade: nothing under `src/` touches a Node builtin, because the published code runs inside a Nuxt
 * app. Only `test/dist-types.test.ts` does, to read what `dist/` holds. Declared the same way as
 * `nuxt-virtual.d.ts`, and kept just as thin — widen it when a test needs more, not before.
 */
declare module 'node:fs' {
  export function readdirSync(path: string): string[]
  export function readFileSync(path: string, encoding: 'utf8'): string
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}
