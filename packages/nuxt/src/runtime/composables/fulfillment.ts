import type { FulfillmentQuote, FulfillmentQuoteInput, PickupLocation } from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

export interface UseFulfillmentReturn {
  pickupLocations: ComputedRef<PickupLocation[]>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  /** The last delivery/pickup quote returned. */
  lastQuote: Ref<FulfillmentQuote | null>
  quoting: Ref<boolean>
  quoteError: Ref<unknown>
  quote: (input: FulfillmentQuoteInput) => Promise<FulfillmentQuote>
}

/**
 * `/customer/fulfillment`.
 *
 * Pickup locations are page data and load on setup; a shipping quote is a `POST` that depends on
 * the chosen address or pickup point, so it is invoked.
 */
export function useFulfillment(options: MawjodAsyncOptions = {}): UseFulfillmentReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:fulfillment:quote')
  const lastQuote = useMawjodRef<FulfillmentQuote | null>(
    'mawjod:fulfillment:last-quote',
    () => null,
  )
  const asyncData = useAsyncData<PickupLocation[]>(
    'mawjod:fulfillment:pickup-locations',
    () => api.fulfillment.pickupLocations(),
    options,
  )

  return {
    pickupLocations: computed(() => asyncData.data.value ?? []),
    pending: asyncData.pending,
    error: asyncData.error,
    refresh: () => asyncData.refresh(),
    lastQuote,
    quoting: task.pending,
    quoteError: task.error,
    quote: async (input) => {
      const quoted = await runTask(task, () => api.fulfillment.quotes(input))

      lastQuote.value = quoted

      return quoted
    },
  }
}
