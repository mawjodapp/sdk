import type {
  CancelOrderInput,
  Order,
  OrdersQuery,
  Paginated,
  PayOrderInput,
  PaymentSession,
} from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type ComputedRef, type MaybeRefOrGetter, type Ref, toValue } from 'vue'

import { queryKey, runTask, useMawjodTask } from '../internal'
import type { MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

export interface UseOrdersReturn {
  orders: ComputedRef<Order[]>
  /** The whole page, when you need `links` or `meta`. */
  page: Ref<Paginated<Order> | undefined>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<void>
  mutating: Ref<boolean>
  mutationError: Ref<unknown>
  get: (orderId: string) => Promise<Order>
  cancel: (orderId: string, input: CancelOrderInput) => Promise<Order>
  pay: (orderId: string, input?: PayOrderInput) => Promise<PaymentSession>
}

/**
 * `/customer/orders`.
 *
 * Filters follow the list contract: `filter[status]` takes a set, `filter[placed_at][from]/[to]` a
 * range, `filter[number]` an exact match, `filter[q]` free text.
 *
 * Pass `{ immediate: false }` when you only want the mutations and not the list.
 */
export function useOrders(
  query?: MaybeRefOrGetter<OrdersQuery | undefined>,
  options: MawjodAsyncOptions = {},
): UseOrdersReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:orders:mutate')
  const resolved = computed(() => toValue(query))
  const asyncData = useAsyncData<Paginated<Order>>(
    `mawjod:orders:${queryKey(resolved.value)}`,
    () => api.orders.list(resolved.value),
    { watch: [resolved], ...options },
  )

  return {
    orders: computed(() => asyncData.data.value?.data ?? []),
    page: asyncData.data,
    pending: asyncData.pending,
    error: asyncData.error,
    refresh: () => asyncData.refresh(),
    mutating: task.pending,
    mutationError: task.error,
    get: (orderId) => runTask(task, () => api.orders.get(orderId)),
    cancel: (orderId, input) => runTask(task, () => api.orders.cancel(orderId, input)),
    pay: (orderId, input) => runTask(task, () => api.orders.pay(orderId, input)),
  }
}
