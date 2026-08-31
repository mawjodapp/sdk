import {
  type CheckoutInput,
  type CheckoutResult,
  isStaleCartError,
  type MawjodApiError,
  type Order,
  type StaleCartErrorCode,
  uuidv7,
} from '@mawjod/api'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import type { CheckoutAttempt } from '../types'
import { useMawjodApi } from './client'

export interface UseCheckoutReturn {
  /** The `Idempotency-Key` / `operation_id` pair of the current attempt. Reused by `retry()`. */
  attempt: Ref<CheckoutAttempt | null>
  result: Ref<CheckoutResult | null>
  order: ComputedRef<Order | null>
  /**
   * Set when the attempt failed with `cart_price_changed`, `cart_not_purchasable` or
   * `insufficient_stock`: the world moved under the buyer. Refetch the cart, show what changed and
   * ask them to confirm. Do not retry silently.
   */
  staleCart: Ref<(MawjodApiError & { code: StaleCartErrorCode }) | null>
  isStale: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  place: (input: CheckoutInput, options?: { idempotencyKey?: string }) => Promise<CheckoutResult>
  /** Replays the last attempt with the same key pair. The server replays; it does not re-charge. */
  retry: (input?: CheckoutInput) => Promise<CheckoutResult>
  reset: () => void
}

/**
 * `POST /customer/checkout`.
 *
 * The idempotency pair is generated here, before the call, rather than being read off a successful
 * response: an attempt that fails is exactly the one that needs to be retried under the same key.
 * The server pins the key to `{operation_id, fulfillment_method, payment_method, address_id,
 * pickup_location_id, expected_items_subtotal_minor}`. Reuse the key with different values and it
 * answers a conflict, not a replay. `retry()` therefore replays the stored input by default.
 */
export function useCheckout(): UseCheckoutReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:checkout')
  const attempt = useMawjodRef<CheckoutAttempt | null>('mawjod:checkout:attempt', () => null)
  const result = useMawjodRef<CheckoutResult | null>('mawjod:checkout:result', () => null)
  const lastInput = useMawjodRef<CheckoutInput | null>('mawjod:checkout:input', () => null)
  const staleCart = useMawjodRef<(MawjodApiError & { code: StaleCartErrorCode }) | null>(
    'mawjod:checkout:stale-cart',
    () => null,
  )

  async function submit(input: CheckoutInput, current: CheckoutAttempt): Promise<CheckoutResult> {
    attempt.value = current
    lastInput.value = input
    staleCart.value = null

    try {
      const placed = await runTask(task, () =>
        api.checkout.place(
          { ...input, operation_id: current.operationId },
          { idempotencyKey: current.idempotencyKey },
        ),
      )

      result.value = placed

      return placed
    } catch (error) {
      if (isStaleCartError(error)) {
        staleCart.value = error
      }

      throw error
    }
  }

  return {
    attempt,
    result,
    order: computed(() => result.value?.order ?? null),
    staleCart,
    isStale: computed(() => staleCart.value !== null),
    pending: task.pending,
    error: task.error,
    place: (input, options = {}) =>
      submit(input, {
        idempotencyKey: options.idempotencyKey ?? uuidv7(),
        operationId: input.operation_id ?? uuidv7(),
      }),
    retry: (input) => {
      const current = attempt.value
      const payload = input ?? lastInput.value

      if (current === null || payload === null) {
        throw new Error('[@mawjod/nuxt] useCheckout().retry() needs an earlier place() to replay.')
      }

      return submit(payload, current)
    },
    reset: () => {
      attempt.value = null
      result.value = null
      lastInput.value = null
      staleCart.value = null
      task.error.value = null
    },
  }
}
