import type { AuthSession, Cart, CartTokenStorage, MawjodClient } from '@mawjod/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCart } from '../src/runtime/composables/cart'
import { useCustomerAuth } from '../src/runtime/composables/auth'
import { useWinCampaign } from '../src/runtime/composables/campaign'
import { useGuestCheckout } from '../src/runtime/composables/checkout'
import { cartFixture, customerFixture } from './helpers'
import { nuxtHarness, resetNuxt } from './nuxt-imports'

interface AuthFakes {
  login: ReturnType<typeof vi.fn>
  loginWithCode: ReturnType<typeof vi.fn>
  merge: ReturnType<typeof vi.fn>
  storage: CartTokenStorage
}

const session: AuthSession = { auth_type: 'customer', customer: customerFixture }

/** Installs a fake client and cart token storage on the current app, the way the plugin would. */
function installFakes(options: {
  token?: string | null
  merge?: () => Promise<Cart>
}): AuthFakes {
  const login = vi.fn(async () => session)
  const loginWithCode = vi.fn(async () => session)
  const guestCheckout = vi.fn(async () => ({ order: { customer: null }, idempotencyKey: 'k', operationId: 'o' }))
  const merge = vi.fn(options.merge ?? (async () => cartFixture(3, 'merged-cart')))
  const storage: CartTokenStorage = { get: () => options.token ?? null, set: vi.fn() }

  const client = {
    auth: { login, loginWithCode },
    guest: { checkout: guestCheckout },
    campaign: {
      win: {
        eligibility: vi.fn(async () => ({ product: { id: 'p-1', name_ar: 'زيت', name_en: 'Oil' } })),
        claim: vi.fn(async () => {
          throw new Error('dropped')
        }),
      },
    },
    cart: { merge, addLine: vi.fn(async () => cartFixture(2)) },
  } as unknown as MawjodClient

  const harness = nuxtHarness()

  harness.nuxtApp['$mawjod'] = client
  harness.nuxtApp['$mawjodCartTokenStorage'] = storage

  return { login, loginWithCode, merge, storage }
}

beforeEach(() => {
  resetNuxt({ runtimeConfig: { mawjod: { apiBase: 'https://shop.test', locale: '' } } })
})

describe('useCart', () => {
  it('writes the response of addLine into the shared cart state', async () => {
    installFakes({})

    const cart = useCart()

    expect(cart.cart.value).toBeNull()
    expect(cart.itemCount.value).toBe(0)
    expect(cart.isEmpty.value).toBe(true)

    const returned = await cart.addLine({ variant_id: 'var-1', quantity: 2 })

    expect(returned.item_count).toBe(2)
    expect(cart.cart.value).toBe(returned)
    expect(cart.itemCount.value).toBe(2)
    expect(cart.isEmpty.value).toBe(false)
    // A second call to the composable must see the same cart, or a header badge and a line list
    // would disagree.
    expect(useCart().cart.value).toBe(returned)
    expect(cart.error.value).toBeNull()
  })
})

describe('useCustomerAuth login', () => {
  it.each(['login', 'loginWithCode'] as const)('%s merges the guest cart when a token is stored', async (method) => {
    const fakes = installFakes({ token: 'a'.repeat(64) })

    const auth = useCustomerAuth()
    const result =
      method === 'login'
        ? await auth.login({ identity: 'layla@example.com', password: 'secret' })
        : await auth.loginWithCode({ identity: 'layla@example.com', code: '123456' })

    expect(fakes[method]).toHaveBeenCalledTimes(1)

    expect(result).toBe(session)
    expect(auth.customer.value).toBe(customerFixture)
    expect(auth.isAuthenticated.value).toBe(true)
    expect(fakes.merge).toHaveBeenCalledTimes(1)
    expect(fakes.merge).toHaveBeenCalledWith('a'.repeat(64))
    expect(useCart().cart.value?.id).toBe('merged-cart')
    expect(auth.mergeError.value).toBeNull()
  })

  it('skips the merge when no guest cart token is stored', async () => {
    const fakes = installFakes({ token: null })

    const auth = useCustomerAuth()

    await auth.login({ identity: 'layla@example.com', password: 'secret' })

    expect(fakes.login).toHaveBeenCalledTimes(1)
    expect(fakes.merge).not.toHaveBeenCalled()
    expect(auth.isAuthenticated.value).toBe(true)
    expect(useCart().cart.value).toBeNull()
    expect(auth.mergeError.value).toBeNull()
  })

  it('keeps the login when the merge fails', async () => {
    const failure = new Error('the guest cart is gone')
    const fakes = installFakes({
      token: 'b'.repeat(64),
      merge: async () => {
        throw failure
      },
    })

    const auth = useCustomerAuth()
    const result = await auth.login({ identity: 'layla@example.com', password: 'secret' })

    expect(result).toBe(session)
    expect(auth.isAuthenticated.value).toBe(true)
    expect(fakes.merge).toHaveBeenCalledTimes(1)
    // The failure is reported, but it is not the login's failure.
    expect(auth.mergeError.value).toBe(failure)
    expect(auth.error.value).toBeNull()
  })
})

describe('useGuestCheckout', () => {
  it('empties the shared cart once the guest order is placed', async () => {
    installFakes({})
    await useCart().addLine({ variant_id: 'var-1', quantity: 2 })

    const { place, order } = useGuestCheckout()

    await place({ customer: { email: 'nour@example.test', phone: '+201000000001' }, fulfillment_method: 'pickup', payment_method: 'cod', pickup_location_id: 'loc-1' })

    expect(order.value?.customer).toBeNull()
    expect(useCart().cart.value).toBeNull()
  })
})

describe('useWinCampaign', () => {
  it('keeps the checked product, and a failed claim leaves no prize behind', async () => {
    installFakes({})
    const win = useWinCampaign()

    await win.checkEligibility({ phone: '+201000000001', code: 'ABC' })
    await expect(win.claim({ phone: '+201000000001', code: 'ABC', rating: 5, comment: '' })).rejects.toThrow('dropped')

    expect(win.product.value?.name_en).toBe('Oil')
    expect(win.claimed.value).toBeNull()
    expect(win.error.value).toBeInstanceOf(Error)
  })
})
