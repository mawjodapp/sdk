/**
 * Type-checking support for the virtual `#imports` alias, for this package only.
 *
 * Inside a real Nuxt app `#imports` is generated into `.nuxt/` and resolves to `nuxt/app` plus the
 * app's own auto-imports. This package has no `.nuxt/`, so the alias is mapped to its actual
 * upstream here. It is a development-time file: it is not under `src/`, so it never reaches `dist/`
 * and can never shadow a consumer's real `#imports`.
 */
declare module '#imports' {
  export * from 'nuxt/app'
}
