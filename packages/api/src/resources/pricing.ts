import type { Transport } from '../http.js'
import type { ProductDisplayPrice } from '../types.js'

export interface ProductPricesInput {
  /** The products on screen, at most 100 per call. */
  product_ids: string[]
}

/** `/pricing/*` — public price display. No session needed. */
export interface PricingNamespace {
  /**
   * Base and after-promotion prices for every purchasable variant of the listed products. Only
   * promotions that hold for anyone appear — no code, no minimum, no per-customer cap — so a
   * card can show the answer without the cart ever taking it back. A product missing from the
   * answer is not publicly visible; render its base price and nothing else.
   */
  productPrices(input: ProductPricesInput): Promise<ProductDisplayPrice[]>
}

export function createPricingNamespace(transport: Transport): PricingNamespace {
  return {
    productPrices: (input) =>
      transport.data<ProductDisplayPrice[]>({ method: 'POST', path: '/pricing/product-prices', body: input }),
  }
}
