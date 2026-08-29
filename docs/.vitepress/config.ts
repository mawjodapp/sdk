import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Mawjod SDK',
  description: 'Client libraries for building Mawjod storefront themes.',
  lang: 'en-US',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: 'API Reference', link: '/api/store', activeMatch: '/api/' },
      { text: 'Nuxt Reference', link: '/nuxt/installation', activeMatch: '/nuxt/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Start here',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Building a theme', link: '/guide/building-a-theme' },
          ],
        },
        {
          text: 'Concepts',
          items: [
            { text: 'Authentication', link: '/guide/authentication' },
            { text: 'Cart', link: '/guide/cart' },
            { text: 'Checkout', link: '/guide/checkout' },
            { text: 'Errors', link: '/guide/errors' },
            { text: 'Money', link: '/guide/money' },
            { text: 'Lists and search', link: '/guide/lists' },
            { text: 'Server-side rendering', link: '/guide/ssr' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'Namespaces',
          items: [
            { text: 'store', link: '/api/store' },
            { text: 'catalog', link: '/api/catalog' },
            { text: 'search', link: '/api/search' },
            { text: 'cart', link: '/api/cart' },
            { text: 'auth', link: '/api/auth' },
            { text: 'customer', link: '/api/customer' },
            { text: 'checkout', link: '/api/checkout' },
            { text: 'orders', link: '/api/orders' },
            { text: 'returns', link: '/api/returns' },
            { text: 'fulfillment', link: '/api/fulfillment' },
            { text: 'platform', link: '/api/platform' },
          ],
        },
        {
          text: 'Shared',
          items: [
            { text: 'Errors', link: '/api/errors' },
            { text: 'Types', link: '/api/types' },
          ],
        },
      ],

      '/nuxt/': [
        {
          text: '@mawjod/nuxt',
          items: [
            { text: 'Installation', link: '/nuxt/installation' },
            { text: 'Configuration', link: '/nuxt/configuration' },
            { text: 'Composables', link: '/nuxt/composables' },
            { text: 'Server-side rendering', link: '/nuxt/ssr' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
    },

    outline: [2, 3],

    docFooter: {
      prev: false,
      next: false,
    },
  },
})
