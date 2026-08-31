import { type CartTokenStorage, defaultCartTokenStorage } from './cart-token.js'
import type { MawjodApiError } from './errors.js'
import { type HeadersOption, Transport } from './http.js'
import { type AuthNamespace, createAuthNamespace } from './resources/auth.js'
import { type CartNamespace, createCartNamespace } from './resources/cart.js'
import { type CatalogNamespace, createCatalogNamespace } from './resources/catalog.js'
import { type CheckoutNamespace, createCheckoutNamespace } from './resources/checkout.js'
import { createCustomerNamespace, type CustomerNamespace } from './resources/customer.js'
import { createFulfillmentNamespace, type FulfillmentNamespace } from './resources/fulfillment.js'
import { createOrdersNamespace, type OrdersNamespace } from './resources/orders.js'
import { createPlatformNamespace, type PlatformNamespace } from './resources/platform.js'
import { createReturnsNamespace, type ReturnsNamespace } from './resources/returns.js'
import { createSearchNamespace, type SearchNamespace } from './resources/search.js'
import { createStoreNamespace, type StoreNamespace } from './resources/store.js'

export interface MawjodClientOptions {
  /**
   * Where the API lives, e.g. `http://localhost:8000`. There is no canonical domain endpoint and
   * no store selector: one deployment serves exactly one store.
   */
  baseUrl: string

  /** Override the fetch implementation. Defaults to the platform's. */
  fetch?: typeof globalThis.fetch

  /**
   * Extra headers for every request. Pass a function to compute them per request: that is how an
   * SSR consumer forwards the incoming `Cookie` header.
   */
  headers?: HeadersOption

  /**
   * Sent as `Accept-Language` on every request, selecting the response locale.
   *
   * The server accepts only `ar` and `en` and answers `422 validation_failed` with an
   * `accept_language` field error for anything else. The type stays open so a deployment that
   * gains a locale does not need a new SDK release.
   *
   * It is a default, not a rule. A header passed through `headers`, or by a call that sets its
   * own, wins over it.
   */
  locale?: 'ar' | 'en' | (string & {})

  /**
   * Called with every problem+json failure before it is thrown. Useful for one global
   * `store_unavailable` screen. It does not swallow the error.
   */
  onError?: (error: MawjodApiError) => void

  /**
   * Where the guest cart token lives. Defaults to `localStorage` under `mawjod:cart_token` in a
   * browser, in-memory elsewhere.
   */
  cartTokenStorage?: CartTokenStorage
}

export interface MawjodClient {
  store: StoreNamespace
  catalog: CatalogNamespace
  search: SearchNamespace
  cart: CartNamespace
  auth: AuthNamespace
  customer: CustomerNamespace
  checkout: CheckoutNamespace
  orders: OrdersNamespace
  returns: ReturnsNamespace
  fulfillment: FulfillmentNamespace
  platform: PlatformNamespace
}

/**
 * Builds a client for one Mawjod deployment.
 *
 * Every request sends `credentials: 'include'`, because identity is a Sanctum session cookie and
 * there is no bearer token anywhere in this API. Writes bootstrap and echo the CSRF token on their
 * own.
 */
export function createMawjodClient(options: MawjodClientOptions): MawjodClient {
  if (typeof options.baseUrl !== 'string' || options.baseUrl === '') {
    throw new Error('createMawjodClient needs a baseUrl, e.g. "http://localhost:8000".')
  }

  const transport = new Transport({
    baseUrl: options.baseUrl,
    fetch: options.fetch ?? resolveFetch(),
    headers: options.headers,
    locale: options.locale,
    onError: options.onError,
    cartTokenStorage: options.cartTokenStorage ?? defaultCartTokenStorage(),
  })

  return {
    store: createStoreNamespace(transport),
    catalog: createCatalogNamespace(transport),
    search: createSearchNamespace(transport),
    cart: createCartNamespace(transport),
    auth: createAuthNamespace(transport),
    customer: createCustomerNamespace(transport),
    checkout: createCheckoutNamespace(transport),
    orders: createOrdersNamespace(transport),
    returns: createReturnsNamespace(transport),
    fulfillment: createFulfillmentNamespace(transport),
    platform: createPlatformNamespace(transport),
  }
}

function resolveFetch(): typeof globalThis.fetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'No global fetch was found. Use Node 20+ or a browser, or pass a fetch implementation ' +
        'through createMawjodClient({ fetch }).',
    )
  }

  // Bound so browsers do not throw "Illegal invocation" when fetch is called detached from window.
  return globalThis.fetch.bind(globalThis)
}
