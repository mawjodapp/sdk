import type { WinClaim, WinClaimInput, WinCodeInput, WinProduct } from '@mawjod/api'
import { type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import { useMawjodApi } from './client'

export interface UseWinCampaignReturn {
  /** The product the checked code belongs to, set by `checkEligibility()`. */
  product: Ref<WinProduct | null>
  /** The won coupon and prize. The only copy the shopper gets: render it before anything else. */
  claimed: Ref<WinClaim | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  checkEligibility: (input: WinCodeInput) => Promise<WinProduct>
  claim: (input: WinClaimInput) => Promise<WinClaim>
  reset: () => void
}

/**
 * `/campaign/win`: check a phone and product code, then trade a review for a prize. Open while
 * `campaigns.win_enabled` is on.
 *
 * `claim()` has no replay and no `retry()`. A response lost after the server issued the coupon
 * cannot be fetched again, so keep the shopper on the page until `claimed` is set.
 */
export function useWinCampaign(): UseWinCampaignReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:win')
  const product = useMawjodRef<WinProduct | null>('mawjod:win:product', () => null)
  const claimed = useMawjodRef<WinClaim | null>('mawjod:win:claimed', () => null)

  return {
    product,
    claimed,
    pending: task.pending,
    error: task.error,
    checkEligibility: async (input) => {
      const checked = await runTask(task, () => api.campaign.win.eligibility(input))

      product.value = checked.product

      return checked.product
    },
    claim: async (input) => {
      const won = await runTask(task, () => api.campaign.win.claim(input))

      claimed.value = won

      return won
    },
    reset: () => {
      product.value = null
      claimed.value = null
      task.error.value = null
    },
  }
}
