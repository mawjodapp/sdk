import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Test against the sources, so `pnpm test` does not depend on `pnpm build` having run.
      '@mawjod/api': fileURLToPath(new URL('./packages/api/src/index.ts', import.meta.url)),
      // Nuxt generates `#imports` into an app's `.nuxt/`. There is no app here, so the module's
      // runtime files get a small hand-written stand-in instead. See the file's own note.
      '#imports': fileURLToPath(new URL('./packages/nuxt/test/nuxt-imports.ts', import.meta.url)),
    },
  },
})
