import type { PublicVendor, VendorApplication, VendorSignupCodeInput, VendorSignupInput } from '@mawjod/api'
import { useAsyncData } from '#imports'
import { computed, type MaybeRefOrGetter, type Ref, toValue } from 'vue'

import { runTask, useMawjodRef, useMawjodTask } from '../internal'
import type { MawjodAsyncData, MawjodAsyncOptions } from '../types'
import { useMawjodApi } from './client'

/**
 * `GET /marketplace/vendors/{slug}`: a seller's public page. Refetches when the slug changes.
 * Errors with `404` for a seller that is not approved or is suspended, and on a single shop.
 * Its products come from `useProducts({ filter: { vendor: slug } })`.
 */
export function useVendor(
  slug: MaybeRefOrGetter<string>,
  options: MawjodAsyncOptions = {},
): MawjodAsyncData<PublicVendor> {
  const api = useMawjodApi()
  const resolved = computed(() => toValue(slug))

  return useAsyncData<PublicVendor>(
    `mawjod:marketplace:vendor:${resolved.value}`,
    () => api.marketplace.vendors.get(resolved.value),
    { watch: [resolved], ...options },
  )
}

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
