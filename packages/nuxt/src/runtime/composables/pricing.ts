import type { ProductDisplayPrice, VariantDisplayPrice } from '@mawjod/api'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import { useMawjodApi } from './client'

export interface UseDisplayPricesReturn {
  /** Everything loaded so far, keyed by product id. Later loads refresh earlier rows. */
  prices: Ref<Record<string, ProductDisplayPrice>>
  pending: Ref<boolean>
  error: Ref<unknown>
  /** Fetches the given products fresh — a sale can start or end between screens. */
  load: (productIds: string[]) => Promise<void>
  forProduct: ComputedRef<(productId: string) => ProductDisplayPrice | null>
  forVariant: ComputedRef<(variantId: string) => VariantDisplayPrice | null>
  reset: () => void
}

/**
 * Display prices for products on screen, loaded in one call per screen rather than one per
 * card. Only promotions that hold for anyone are returned; a product absent from `prices`
 * simply shows its base price. The cart quote remains the price that counts at checkout.
 */
export function useDisplayPrices(): UseDisplayPricesReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:display-prices')
  const prices = useMawjodRef<Record<string, ProductDisplayPrice>>('mawjod:display-prices:rows', () => ({}))

  const byVariant = computed(() => {
    const index: Record<string, VariantDisplayPrice> = {}

    for (const row of Object.values(prices.value)) {
      for (const variant of row.variants) {
        index[variant.variant_id] = variant
      }
    }

    return index
  })

  return {
    prices,
    pending: task.pending,
    error: task.error,
    load: async (productIds) => {
      if (productIds.length === 0) return

      const rows = await runTask(task, () => api.pricing.productPrices({ product_ids: productIds }))
      const merged = { ...prices.value }

      // A loaded product that came back without a row is no longer on sale (or no longer
      // public): its stale row must not keep promising yesterday's price.
      for (const productId of productIds) {
        delete merged[productId]
      }

      for (const row of rows) {
        merged[row.product_id] = row
      }

      prices.value = merged
    },
    forProduct: computed(() => (productId: string) => prices.value[productId] ?? null),
    forVariant: computed(() => (variantId: string) => byVariant.value[variantId] ?? null),
    reset: () => {
      prices.value = {}
    },
  }
}
