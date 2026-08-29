/**
 * A guest cart is addressed by the `X-Mawjod-Cart-Token` header, not by the session cookie.
 *
 * The token comes back exactly once — in the 201 that creates the cart — and every later response
 * carries `guest_token: null`. It is not recoverable from the server. Lose it and the cart is
 * unreachable, so the client captures it on sight and stores it.
 */
export interface CartTokenStorage {
  get(): string | null | Promise<string | null>
  set(token: string | null): void | Promise<void>
}

export const CART_TOKEN_STORAGE_KEY = 'mawjod:cart_token'

/** Keeps the token for the lifetime of the client object only. Used on the server. */
export function memoryCartTokenStorage(initial: string | null = null): CartTokenStorage {
  let token = initial

  return {
    get: () => token,
    set: (next) => {
      token = next
    },
  }
}

/**
 * Browser default. Every access is guarded: `localStorage` throws rather than returning null when
 * a browser is configured to block site data, and a cart token is not worth crashing a page over.
 */
export function localStorageCartTokenStorage(key: string = CART_TOKEN_STORAGE_KEY): CartTokenStorage {
  return {
    get: () => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (token) => {
      try {
        if (token === null) {
          localStorage.removeItem(key)
        } else {
          localStorage.setItem(key, token)
        }
      } catch {
        // Storage is unavailable. The cart survives for this page load through the in-flight
        // responses and is lost on reload, which beats throwing.
      }
    },
  }
}

/** `localStorage` in a browser, in-memory everywhere else. */
export function defaultCartTokenStorage(): CartTokenStorage {
  if (hasLocalStorage()) {
    return localStorageCartTokenStorage()
  }

  return memoryCartTokenStorage()
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
}
