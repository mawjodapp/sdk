import type { FulfillmentQuote, FulfillmentQuoteInput, GuestQuoteInput, PickupLocation } from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type ComputedRef, type MaybeRefOrGetter, type Ref, toValue } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

interface FulfillmentReturn<TQuoteInput> {
  pickupLocations: ComputedRef<PickupLocation[]>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  /** The last delivery/pickup quote returned. */
  lastQuote: Ref<FulfillmentQuote | null>
  quoting: Ref<boolean>
  quoteError: Ref<unknown>
  quote: (input: TQuoteInput) => Promise<FulfillmentQuote>
}

export type UseFulfillmentReturn = FulfillmentReturn<FulfillmentQuoteInput>

export interface UseFulfillmentOptions extends MawjodAsyncOptions {
  /**
   * Marketplace: the cart's seller slug (`cart.vendor?.slug`). Only that seller's pickup points
   * are listed, because checkout takes no other. The list reloads when it changes.
   */
  vendor?: MaybeRefOrGetter<string | null | undefined>
}
export type UseGuestFulfillmentReturn = FulfillmentReturn<GuestQuoteInput>

/**
 * `/customer/fulfillment`.
 *
 * Pickup locations are page data and load on setup; a shipping quote is a `POST` that depends on
 * the chosen address or pickup point, so it is invoked.
 */
export function useFulfillment(options: UseFulfillmentOptions = {}): UseFulfillmentReturn {
  const api = useMawjodApi()
  const { vendor, ...asyncOptions } = options
  const slug = computed(() => toValue(vendor) ?? undefined)

  return useFulfillmentFlow(
    'mawjod:fulfillment',
    { ...asyncOptions, watch: vendor === undefined ? undefined : [slug] },
    () => api.fulfillment.pickupLocations(slug.value),
    (input: FulfillmentQuoteInput) => api.fulfillment.quotes(input),
  )
}

/**
 * `/guest/fulfillment`: the same pickup list and quote for a shopper who is not signed in, quoted
 * from a `position` rather than a saved address. Open while `checkout.guest_enabled` is on.
 */
export function useGuestFulfillment(options: MawjodAsyncOptions = {}): UseGuestFulfillmentReturn {
  const api = useMawjodApi()

  return useFulfillmentFlow(
    'mawjod:guest-fulfillment',
    options,
    () => api.guest.fulfillment.pickupLocations(),
    (input: GuestQuoteInput) => api.guest.fulfillment.quotes(input),
  )
}

function useFulfillmentFlow<TQuoteInput>(
  prefix: string,
  options: MawjodAsyncOptions & { watch?: ComputedRef<unknown>[] },
  list: () => Promise<PickupLocation[]>,
  quote: (input: TQuoteInput) => Promise<FulfillmentQuote>,
): FulfillmentReturn<TQuoteInput> {
  const task = useMawjodTask(`${prefix}:quote`)
  const lastQuote = useMawjodRef<FulfillmentQuote | null>(`${prefix}:last-quote`, () => null)
  const asyncData = useAsyncData<PickupLocation[]>(`${prefix}:pickup-locations`, () => list(), options)

  return {
    pickupLocations: computed(() => asyncData.data.value ?? []),
    pending: asyncData.pending,
    error: asyncData.error,
    refresh: () => asyncData.refresh(),
    lastQuote,
    quoting: task.pending,
    quoteError: task.error,
    quote: async (input) => {
      const quoted = await runTask(task, () => quote(input))

      lastQuote.value = quoted

      return quoted
    },
  }
}
