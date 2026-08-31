/**
 * `@mawjod/api`: a zero-dependency client for the Mawjod storefront API.
 *
 * Everything is exported from here. There is no default export.
 */

export { createMawjodClient } from './client.js'
export type { MawjodClient, MawjodClientOptions } from './client.js'

export {
  CART_TOKEN_STORAGE_KEY,
  defaultCartTokenStorage,
  localStorageCartTokenStorage,
  memoryCartTokenStorage,
} from './cart-token.js'
export type { CartTokenStorage } from './cart-token.js'

export {
  isCheckoutError,
  isForbidden,
  isMawjodApiError,
  isMawjodNetworkError,
  isPayloadIntegrityError,
  isStaleCartError,
  isStoreUnavailable,
  isUnauthenticated,
  isValidationError,
  MawjodApiError,
  MawjodNetworkError,
  PayloadIntegrityError,
} from './errors.js'
export type {
  CheckoutErrorCode,
  MawjodErrorCode,
  PayloadIntegrityResource,
  ProblemDocument,
  StaleCartErrorCode,
} from './errors.js'

export { imageSrcSet } from './images.js'
export type { ImageSrcSet } from './images.js'

export { formatMoney } from './money.js'
export { uuidv7 } from './uuid.js'
export { appendQuery, buildQuery } from './query.js'
export type { FilterRange, FilterValue, PageValue, QueryInput, QueryScalar, SortValue } from './query.js'

export type { HeadersOption } from './http.js'

export type { StoreNamespace } from './resources/store.js'
export type {
  CatalogNamespace,
  CatalogProductsQuery,
  CatalogTaxonomyQuery,
} from './resources/catalog.js'
export type { SearchNamespace, SearchProductsQuery } from './resources/search.js'
export type { AddCartLineInput, CartNamespace } from './resources/cart.js'
export type {
  AuthNamespace,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyInput,
} from './resources/auth.js'
export type {
  AddressInput,
  AreasQuery,
  CustomerNamespace,
  UpdateProfileInput,
} from './resources/customer.js'
export type {
  CheckoutInput,
  CheckoutNamespace,
  CheckoutOptions,
  CheckoutResult,
} from './resources/checkout.js'
export type {
  CancelOrderInput,
  OrdersNamespace,
  OrdersQuery,
  OrderStatus,
  PayOrderInput,
} from './resources/orders.js'
export type {
  AddEvidenceInput,
  CancelReturnInput,
  CreateReturnInput,
  CreateReturnLineInput,
  ReturnsNamespace,
  ReturnsQuery,
  ReturnStatus,
} from './resources/returns.js'
export type {
  FulfillmentNamespace,
  FulfillmentQuoteInput,
} from './resources/fulfillment.js'
export type { PlatformNamespace } from './resources/platform.js'

export type * from './types.js'
