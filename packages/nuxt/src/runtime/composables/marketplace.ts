import type { VendorApplication, VendorSignupCodeInput, VendorSignupInput } from '@mawjod/api'
import { type Ref } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import { useMawjodApi } from './client'

export interface UseVendorSignupReturn {
  /** The address the last code went to, set by `sendCode()`. Null before then. */
  email: Ref<string | null>
  /** The filed application, set by `apply()`. */
  application: Ref<VendorApplication | null>
  pending: Ref<boolean>
  error: Ref<unknown>
  sendCode: (input: VendorSignupCodeInput) => Promise<void>
  apply: (input: VendorSignupInput) => Promise<VendorApplication>
  /** Back to the first step: forgets the address, the application and the error. */
  reset: () => void
}

/**
 * `/marketplace/vendor-signup`: a business asks for a code, then files its application with it.
 * Marketplace only, and only while `marketplace.vendor_registration` is open.
 */
export function useVendorSignup(): UseVendorSignupReturn {
  const api = useMawjodApi()
  const task = useMawjodTask('mawjod:vendor-signup')
  const email = useMawjodRef<string | null>('mawjod:vendor-signup:email', () => null)
  const application = useMawjodRef<VendorApplication | null>('mawjod:vendor-signup:application', () => null)

  return {
    email,
    application,
    pending: task.pending,
    error: task.error,
    sendCode: async (input) => {
      await runTask(task, () => api.marketplace.vendorSignup.sendCode(input))

      email.value = input.email
    },
    apply: async (input) => {
      const filed = await runTask(task, () => api.marketplace.vendorSignup.apply(input))

      application.value = filed

      return filed
    },
    reset: () => {
      email.value = null
      application.value = null
      task.error.value = null
    },
  }
}
