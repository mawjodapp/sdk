import type { AuthSession, Cart, CartTokenStorage, MawjodClient } from '@mawjod/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCart } from '../src/runtime/composables/cart'
import { useCustomerAuth } from '../src/runtime/composables/auth'
import { cartFixture, customerFixture } from './helpers'
import { nuxtHarness, resetNuxt } from './nuxt-imports'

interface AuthFakes {
  login: ReturnType<typeof vi.fn>
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
  const merge = vi.fn(options.merge ?? (async () => cartFixture(3, 'merged-cart')))
  const storage: CartTokenStorage = { get: () => options.token ?? null, set: vi.fn() }

  const client = {
    auth: { login },
    cart: { merge, addLine: vi.fn(async () => cartFixture(2)) },
  } as unknown as MawjodClient

  const harness = nuxtHarness()

  harness.nuxtApp['$mawjod'] = client
  harness.nuxtApp['$mawjodCartTokenStorage'] = storage

  return { login, merge, storage }
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
  it('merges the guest cart when a token is stored and refreshes cart state', async () => {
    const fakes = installFakes({ token: 'a'.repeat(64) })

    const auth = useCustomerAuth()
    const result = await auth.login({ identity: 'layla@example.com', password: 'secret' })

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
