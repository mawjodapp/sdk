import type { AddCartLineInput, Cart, CartLine, CartQuote, Money } from '@mawjod/api'
import { useState } from '#imports'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, STATE_KEYS, useMawjodTask } from '../internal'
import { useMawjodApi } from './client'

export interface UseCartReturn {
  cart: Ref<Cart | null>
  /** The last quote seen, from `quote()` or from a coupon call. Pricing lives here, not on `cart`. */
  latestQuote: Ref<CartQuote | null>
  lines: ComputedRef<CartLine[]>
  itemCount: ComputedRef<number>
  subtotal: ComputedRef<Money | null>
  isEmpty: ComputedRef<boolean>
  hasUnpurchasableLines: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  refresh: () => Promise<Cart>
  addLine: (input: AddCartLineInput) => Promise<Cart>
  updateLine: (lineId: string, quantity: number) => Promise<Cart>
  removeLine: (lineId: string) => Promise<Cart>
  applyCoupon: (code: string) => Promise<CartQuote>
  removeCoupon: () => Promise<CartQuote>
  quote: () => Promise<CartQuote>
  merge: (guestToken?: string) => Promise<Cart>
  /** Write the shared state without a call. Used by `useCustomerAuth()` after a login merge. */
  setCart: (next: Cart | null) => void
  setQuote: (next: CartQuote | null) => void
}

/**
 * The shared cart. Every mutation writes the response straight into the shared state, so a badge in
 * the header and a line list on the page never disagree.
 *
 * The guest cart is identified by `X-Mawjod-Cart-Token`, which `@mawjod/api` captures and replays on
 * its own. On the server that token lives in memory for one request only: guest cart writes during
 * SSR are not a supported path. Do them in the browser.
 */
export function useCart(): UseCartReturn {
  const api = useMawjodApi()
  const cart = useState<Cart | null>(STATE_KEYS.cart, () => null)
  const latestQuote = useState<CartQuote | null>(STATE_KEYS.cartQuote, () => null)
  const task = useMawjodTask('mawjod:cart')

  const store = (next: Cart): Cart => {
    cart.value = next

    return next
  }

  const storeQuote = (next: CartQuote): CartQuote => {
    latestQuote.value = next

    return next
  }

  return {
    cart,
    latestQuote,
    lines: computed(() => cart.value?.lines ?? []),
    itemCount: computed(() => cart.value?.item_count ?? 0),
    subtotal: computed(() => cart.value?.subtotal ?? null),
    isEmpty: computed(() => (cart.value?.item_count ?? 0) === 0),
    hasUnpurchasableLines: computed(() => cart.value?.has_unpurchasable_lines ?? false),
    pending: task.pending,
    error: task.error,
    refresh: () => runTask(task, async () => store(await api.cart.get())),
    addLine: (input) => runTask(task, async () => store(await api.cart.addLine(input))),
    updateLine: (lineId, quantity) =>
      runTask(task, async () => store(await api.cart.updateLine(lineId, quantity))),
    removeLine: (lineId) => runTask(task, async () => store(await api.cart.removeLine(lineId))),
    applyCoupon: (code) => runTask(task, async () => storeQuote(await api.cart.applyCoupon(code))),
    removeCoupon: () => runTask(task, async () => storeQuote(await api.cart.removeCoupon())),
    quote: () => runTask(task, async () => storeQuote(await api.cart.quote())),
    merge: (guestToken) => runTask(task, async () => store(await api.cart.merge(guestToken))),
    setCart: (next) => {
      cart.value = next
    },
    setQuote: (next) => {
      latestQuote.value = next
    },
  }
}
