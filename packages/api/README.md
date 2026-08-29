# @mawjod/api

Zero-dependency TypeScript client for the Mawjod storefront API.

```sh
pnpm add @mawjod/api
```

```ts
import { createMawjodClient, formatMoney } from '@mawjod/api'

const mawjod = createMawjodClient({ baseUrl: 'http://localhost:8000' })
const page = await mawjod.catalog.products.list({ page: { size: 12 } })
const product = await mawjod.catalog.products.get(page.data[0]!.slug)
const cart = await mawjod.cart.addLine({ variant_id: product.variants[0]!.id, quantity: 1 })

console.log(formatMoney(cart.subtotal, 'en-EG'))
```

Full documentation lives in the SDK docs site.
