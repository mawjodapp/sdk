import {
  type CheckoutInput,
  type CheckoutResult,
  type GuestCheckoutInput,
  type GuestCheckoutResult,
  type GuestOrder,
  isStaleCartError,
  type MawjodApiError,
  type Order,
  type StaleCartErrorCode,
  uuidv7,
} from '@mawjod/api'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import type { CheckoutAttempt } from '../types'
import { useCart } from './cart'
import { useMawjodApi } from './client'

interface CheckoutFlowReturn<TInput, TResult extends { order: unknown }> {
  /** The `Idempotency-Key` / `operation_id` pair of the current attempt. Reused by `retry()`. */
  attempt: Ref<CheckoutAttempt | null>
  result: Ref<TResult | null>
  order: ComputedRef<TResult['order'] | null>
  /**
   * Set when the attempt failed with `cart_price_changed`, `cart_not_purchasable` or
   * `insufficient_stock`: the world moved under the buyer. Refetch the cart, show what changed and
   * ask them to confirm. Do not retry silently.
   */
  staleCart: Ref<(MawjodApiError & { code: StaleCartErrorCode }) | null>
  isStale: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  place: (input: TInput, options?: { idempotencyKey?: string }) => Promise<TResult>
  /** Replays the last attempt with the same key pair. The server replays; it does not re-charge. */
  retry: (input?: TInput) => Promise<TResult>
  reset: () => void
}

export type UseCheckoutReturn = CheckoutFlowReturn<CheckoutInput, CheckoutResult>
export type UseGuestCheckoutReturn = CheckoutFlowReturn<GuestCheckoutInput, GuestCheckoutResult>

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

  return useCheckoutFlow<CheckoutInput, CheckoutResult>('mawjod:checkout', 'useCheckout', (input, key) =>
    api.checkout.place(input, { idempotencyKey: key }),
  )
}

/**
 * `POST /guest/checkout`: the same attempt pair and retry rules as `useCheckout`, for a shopper who
 * is not signed in. Open while `checkout.guest_enabled` is on; cash on delivery only.
 *
 * On success the shared cart state is emptied, because the server released the guest token with
 * the cart it bought. Nobody is signed in afterwards, and `order.customer` is always `null`.
 */
export function useGuestCheckout(): UseGuestCheckoutReturn {
  const api = useMawjodApi()
  const cart = useCart()

  return useCheckoutFlow<GuestCheckoutInput, GuestCheckoutResult>(
    'mawjod:guest-checkout',
    'useGuestCheckout',
    async (input, key) => {
      const placed = await api.guest.checkout(input, { idempotencyKey: key })

      cart.setCart(null)
      cart.setQuote(null)

      return placed
    },
  )
}

function useCheckoutFlow<TInput extends { operation_id?: string }, TResult extends { order: Order | GuestOrder }>(
  prefix: string,
  name: string,
  call: (input: TInput, idempotencyKey: string) => Promise<TResult>,
): CheckoutFlowReturn<TInput, TResult> {
  const task = useMawjodTask(prefix)
  const attempt = useMawjodRef<CheckoutAttempt | null>(`${prefix}:attempt`, () => null)
  const result = useMawjodRef<TResult | null>(`${prefix}:result`, () => null)
  const lastInput = useMawjodRef<TInput | null>(`${prefix}:input`, () => null)
  const staleCart = useMawjodRef<(MawjodApiError & { code: StaleCartErrorCode }) | null>(
    `${prefix}:stale-cart`,
    () => null,
  )

  async function submit(input: TInput, current: CheckoutAttempt): Promise<TResult> {
    attempt.value = current
    lastInput.value = input
    staleCart.value = null

    try {
      const placed = await runTask(task, () =>
        call({ ...input, operation_id: current.operationId }, current.idempotencyKey),
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
        throw new Error(`[@mawjod/nuxt] ${name}().retry() needs an earlier place() to replay.`)
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
