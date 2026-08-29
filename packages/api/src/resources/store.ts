import type { Transport } from '../http.js'
import type { StoreInfo, StoreSettings } from '../types.js'

export interface StoreNamespace {
  /** The public store profile. There is no way to select another store: one deployment, one store. */
  get(): Promise<StoreInfo>
  /**
   * Public settings. Read `checkout.allowed_payment_methods` from here rather than assuming which
   * payment methods exist.
   */
  settings(): Promise<StoreSettings>
}

export function createStoreNamespace(transport: Transport): StoreNamespace {
  return {
    get: () => transport.data<StoreInfo>({ method: 'GET', path: '/store' }),
    settings: () => transport.data<StoreSettings>({ method: 'GET', path: '/store/settings' }),
  }
}
