import type {
  AcceptedStatus,
  AuthSession,
  Customer,
  LoginInput,
  PasswordResetStatus,
  RegisterInput,
  ResetPasswordInput,
  SignedOutStatus,
  VerifyInput,
} from '@mawjod/api'
import { useState } from '#imports'
import { computed, type ComputedRef, type Ref } from 'vue'

import { runTask, STATE_KEYS, useMawjodRef, useMawjodTask } from '../internal'
import { useCart } from './cart'
import { useMawjodApi, useMawjodCartTokenStorage } from './client'

export interface UseCustomerAuthOptions {
  /**
   * After a successful login, hand the guest cart to the account that just signed in.
   *
   * On by default: a shopper who filled a cart and then logged in expects to keep it. The merge is
   * skipped when no guest cart token is stored, and a failing merge never fails the login — the
   * session is real either way, and the reason lands on `mergeError`.
   */
  mergeCartOnLogin?: boolean
}

export interface UseCustomerAuthReturn {
  customer: Ref<Customer | null>
  isAuthenticated: ComputedRef<boolean>
  pending: Ref<boolean>
  error: Ref<unknown>
  /** Why the post-login cart merge failed, if it did. Never thrown. */
  mergeError: Ref<unknown>
  login: (input: LoginInput) => Promise<AuthSession>
  register: (input: RegisterInput) => Promise<Customer>
  verify: (input: VerifyInput) => Promise<Customer>
  resendVerification: (identity: string) => Promise<AcceptedStatus>
  forgotPassword: (identity: string) => Promise<AcceptedStatus>
  resetPassword: (input: ResetPasswordInput) => Promise<PasswordResetStatus>
  logout: () => Promise<SignedOutStatus>
  /** Run the guest-cart merge by hand. A no-op when no token is stored. */
  mergeGuestCart: () => Promise<void>
}

/**
 * Customer sessions. Identity rides a Sanctum session cookie — there are no bearer tokens to hold.
 *
 * `register()` and `verify()` deliberately do not populate `customer`: neither creates a session.
 */
export function useCustomerAuth(options: UseCustomerAuthOptions = {}): UseCustomerAuthReturn {
  const { mergeCartOnLogin = true } = options

  const api = useMawjodApi()
  const storage = useMawjodCartTokenStorage()
  const cart = useCart()
  const customer = useState<Customer | null>(STATE_KEYS.customer, () => null)
  const task = useMawjodTask('mawjod:auth')
  const mergeError = useMawjodRef<unknown>('mawjod:auth:merge-error', () => null)

  async function mergeGuestCart(): Promise<void> {
    mergeError.value = null

    let token: string | null = null

    try {
      token = await storage.get()
    } catch (error) {
      mergeError.value = error

      return
    }

    // Nothing to merge. `cart.merge()` would throw on a missing token, and that is not an error
    // worth surfacing to someone who simply had no guest cart.
    if (token === null || token === '') {
      return
    }

    try {
      // Called on the raw client rather than through `cart.merge()` so a merge failure does not
      // light up the cart's own error state — the cart itself is fine.
      cart.setCart(await api.cart.merge(token))
    } catch (error) {
      mergeError.value = error
    }
  }

  return {
    customer,
    isAuthenticated: computed(() => customer.value !== null),
    pending: task.pending,
    error: task.error,
    mergeError,
    login: async (input) => {
      const session = await runTask(task, () => api.auth.login(input))

      customer.value = session.customer

      if (mergeCartOnLogin) {
        await mergeGuestCart()
      }

      return session
    },
    register: (input) => runTask(task, () => api.auth.register(input)),
    verify: (input) => runTask(task, () => api.auth.verify(input)),
    resendVerification: (identity) => runTask(task, () => api.auth.resendVerification(identity)),
    forgotPassword: (identity) => runTask(task, () => api.auth.forgotPassword(identity)),
    resetPassword: (input) => runTask(task, () => api.auth.resetPassword(input)),
    logout: async () => {
      const result = await runTask(task, () => api.auth.logout())

      customer.value = null
      cart.setCart(null)
      cart.setQuote(null)
      mergeError.value = null

      return result
    },
    mergeGuestCart,
  }
}
