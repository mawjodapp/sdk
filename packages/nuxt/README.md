# @mawjod/nuxt

Nuxt 4 module for the Mawjod storefront API. Composables only — no components, no styles.

```sh
pnpm add @mawjod/nuxt @mawjod/api
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@mawjod/nuxt'],
  mawjod: { apiBase: 'http://localhost:8000', locale: 'en' },
})
```

```vue
<script setup lang="ts">
const { data: products } = await useProducts({ page: { size: 12 } })
const { addLine, itemCount } = useCart()
</script>
```

`apiBase` is overridable at boot with `NUXT_PUBLIC_MAWJOD_API_BASE`.

Full documentation lives in the SDK docs site.
