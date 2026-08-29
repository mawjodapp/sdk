import type { Transport } from '../http.js'
import type { Cart, CartQuote } from '../types.js'

export interface AddCartLineInput {
  variant_id: string
  /** 1-999. Adding an identical line sums into the existing one. */
  quantity: number
  /** Reserved. Release 1 accepts only `{}`. */
  options?: Record<string, never>
}

export interface CartNamespace {
  /** Reads the caller's cart with refreshed prices and availability. */
  get(): Promise<Cart>
  /** Reprices the cart, re-evaluating promotions. Does not mutate it. */
  quote(): Promise<CartQuote>
  /**
   * Adds a variant, creating the cart when there is none. For a guest this is the response that
   * issues `guest_token` — the client captures it automatically and sends it as
   * `X-Mawjod-Cart-Token` from here on.
   */
  addLine(input: AddCartLineInput): Promise<Cart>
  /** Replaces one line's quantity (1-999). */
  updateLine(lineId: string, quantity: number): Promise<Cart>
  removeLine(lineId: string): Promise<Cart>
  applyCoupon(code: string): Promise<CartQuote>
  removeCoupon(): Promise<CartQuote>
  /**
   * Merges the guest cart into the signed-in customer's cart. Additive and deterministic:
   * identical lines sum, guest-only lines move across, replaying the same token merges once.
   *
   * Defaults to the stored guest token. On success the stored token is cleared — the guest cart is
   * gone and replaying a dead token would be noise. Note the contract inconsistency: every other
   * cart call carries the token in a header, this one takes it in the body.
   */
  merge(guestToken?: string): Promise<Cart>
}

export function createCartNamespace(transport: Transport): CartNamespace {
  return {
    get: () => transport.data<Cart>({ method: 'GET', path: '/cart' }),

    quote: () => transport.data<CartQuote>({ method: 'GET', path: '/cart/quote' }),

    addLine: (input) => transport.data<Cart>({ method: 'POST', path: '/cart/lines', body: input }),

    updateLine: (lineId, quantity) =>
      transport.data<Cart>({
        method: 'PUT',
        path: `/cart/lines/${encodeURIComponent(lineId)}`,
        body: { quantity },
      }),

    removeLine: (lineId) =>
      transport.data<Cart>({
        method: 'DELETE',
        path: `/cart/lines/${encodeURIComponent(lineId)}`,
      }),

    applyCoupon: (code) =>
      transport.data<CartQuote>({ method: 'POST', path: '/cart/coupon', body: { code } }),

    removeCoupon: () => transport.data<CartQuote>({ method: 'DELETE', path: '/cart/coupon' }),

    merge: async (guestToken) => {
      const token = guestToken ?? (await transport.readCartToken())

      if (token === null || token === '') {
        throw new Error(
          'cart.merge needs a guest cart token, and none was passed or stored. There is nothing ' +
            'to merge.',
        )
      }

      const cart = await transport.data<Cart>({
        method: 'POST',
        path: '/cart/merge',
        body: { guest_token: token },
      })

      await transport.clearCartToken()

      return cart
    },
  }
}
