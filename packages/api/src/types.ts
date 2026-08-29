/**
 * Resource shapes for the Mawjod storefront surface.
 *
 * Verified against the backend's API resource classes rather than only the generated docs: several
 * fields (`totals.discount_total`, `payment.requires_action`, order and return line shapes,
 * `name_ar`/`name_en` on cart lines) are real but absent from the Scribe examples.
 */

/**
 * Money is always integer minor units plus a currency. Never a float — a float cannot represent
 * a piastre and the API never sends one.
 *
 * `tax_inclusive` is currently always `true` for this deployment; it is carried anyway because the
 * server states it rather than leaving it implied.
 */
export interface Money {
  minor: number
  currency: string
  tax_inclusive: boolean
}

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                   */
/* -------------------------------------------------------------------------- */

export interface ApiMeta {
  /** Matches the `X-Request-ID` response header. Quote it when reporting a failure. */
  request_id: string
}

export interface PaginationMeta extends ApiMeta {
  current_page: number
  per_page: number
  last_page: number
  /** The count *after* filtering, not the collection size. */
  total: number
}

export interface PaginationLinks {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

export interface Paginated<T> {
  data: T[]
  links: PaginationLinks
  meta: PaginationMeta
}

export interface SearchFacetValue {
  value: string
  count: number
}

export interface SearchFacet {
  field: string
  values: SearchFacetValue[]
}

export interface SearchMeta extends PaginationMeta {
  /** `"meilisearch"`, or a Postgres fallback value when the engine is down. */
  engine: string
  exhaustive_total: boolean
  facets: SearchFacet[]
}

export interface SearchResults<T> {
  data: T[]
  links: PaginationLinks
  meta: SearchMeta
}

/* -------------------------------------------------------------------------- */
/* Store                                                                       */
/* -------------------------------------------------------------------------- */

export type StoreLocale = 'ar' | 'en'

export interface StoreInfo {
  id: string
  status: string
  /** Already localized by the server from `Accept-Language`. */
  name: string
  default_locale: StoreLocale
  /**
   * The store's brand images, already resolved to urls. This is where a theme reads the logo:
   * `StoreSettings` carries the bare asset ids and resolves nothing.
   *
   * Either one is `null` when the store has not set it, so fall back to `name`.
   */
  branding: {
    logo: Image | null
    icon: Image | null
  }
}

export interface StoreSettingEntry {
  type: string
  value: unknown
  mutable: boolean
  audience: string
  schema_version: number
  existing_record_effect: string
}

/**
 * Public settings, keyed by setting name (e.g. `checkout.allowed_payment_methods`,
 * `branding.primary_color`).
 *
 * `branding.logo_asset_id` and `branding.icon_asset_id` are writable by the store's staff. A
 * written value has to name a store-owned, public, fully-uploaded media asset, and anything else
 * (a product photo, a pending upload, an unknown id) is refused with a 422. What the setting
 * carries is only the asset UUID; it resolves nothing. To render the logo read
 * `StoreInfo.branding.logo` from `store.get()`, which comes back as a full `Image`. The rest of
 * the branding here is `branding.primary_color` and `branding.accent_color`, plain colour strings.
 */
export interface StoreSettings {
  settings: Record<string, StoreSettingEntry>
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One generated size of an image.
 *
 * Read the `url` off the rendition. Never build one by rewriting the original's url: how a
 * rendition is named and where it is stored is the server's business, and a naming change would
 * break every url you derived.
 */
export interface ImageRendition {
  url: string
  width: number
  height: number
}

/**
 * An image on a product, a variant, or a taxonomy row.
 *
 * The original carries no `width` or `height`. That is deliberate: dimensions exist per rendition,
 * which is where a layout actually needs them. Do not add them here.
 */
export interface Image {
  id: string
  /** The original upload. The largest thing available, and the safe `src` fallback. */
  url: string
  /** Follows the requested language with the same fallback as the rest of the catalog. */
  alt: string | null
  /**
   * Generated sizes, keyed by rendition name. `thumbnail`, `medium` and `large` exist today.
   *
   * Treat it as an open map. A missing key means that size has not been generated yet, not that
   * something failed, and a size added later must not break what you wrote today. Iterate the keys
   * you are given rather than reaching for three you assume are there.
   *
   * On the wire an empty map arrives as `[]` rather than `{}` (PHP's empty-array encoding).
   * JavaScript consumers see no difference; a client generated for a statically typed language
   * must accept both encodings.
   */
  renditions: Record<string, ImageRendition>
}

/** A category as the storefront sees it: already resolved to one locale. */
export interface Category {
  id: string
  locale: string
  name: string
  slug: string
}

/**
 * A row from `GET /catalog/categories`.
 *
 * Only the listing carries an image. The `category` embedded in a product is a plain `Category`
 * and never has one, which is why this is a separate type rather than an optional field: an
 * optional `image` on the shared shape would read as available on a product card and be
 * `undefined` every time.
 */
export interface CategoryListItem extends Category {
  image: Image | null
}

/** A brand as the storefront sees it: already resolved to one locale. */
export interface Brand {
  id: string
  locale: string
  name: string
  slug: string
}

/** A row from `GET /catalog/brands`. Same split as `CategoryListItem`, for the same reason. */
export interface BrandListItem extends Brand {
  image: Image | null
}

export interface Variant {
  id: string
  sku: string
  barcode: string | null
  price: Money
  /** Always an array, never `null` and never absent. Empty is the ordinary case. */
  images: Image[]
  available: boolean
}

export interface ProductSummary {
  id: string
  locale: string
  slug: string
  name: string
  category: Category
  brand: Brand
  /** The cheapest variant's price. */
  from_price: Money
  /** The product's lead image, or `null` when it has none. */
  image: Image | null
  variants_count: number
  published_at: string | null
}

/**
 * One attribute of a product, as the detail view carries it.
 *
 * Only `GET /catalog/products/{slug}` returns these. A summary row does not, so a product card
 * cannot filter on them.
 */
export interface ProductAttribute {
  key: string
  /** Localized display name. */
  name: string
  /** e.g. `option`, `text`, `number`, `boolean`. Open — do not union. */
  type: string
  /**
   * Source-verified: string | int | bool | null on the server.
   *
   * A `boolean` attribute arrives as a JSON `true` or `false`, never the string `"true"` and never
   * `1`. The server canonicalizes through the column's type before storing, so no defensive
   * coercion is needed on this side.
   */
  value: string | number | boolean | null
}

/** `GET /catalog/products/{slug}` — the summary plus the fields only the detail view carries. */
export interface Product extends ProductSummary {
  description: string | null
  /**
   * Every image on the product, in order. `image` inherited from the summary is `images[0]`: the
   * same asset, not a separate one, so a detail page can render the gallery from `images` and
   * ignore `image` entirely.
   */
  images: Image[]
  variants: Variant[]
  /** The product's attributes. Empty when it has none. */
  attributes: ProductAttribute[]
}

export interface SearchTaxonomyRef {
  id: string | null
  name: string
}

/**
 * A search hit. Deliberately not a `ProductSummary`: the search index stores both locale names side
 * by side and does not resolve one. The slug is not one of those: a product has a single slug that
 * is the same string under `ar` and `en`.
 *
 * A hit carries no image. Render results as text, or follow the slugs on the visible page into
 * `catalog.products.get` when you want pictures.
 */
export interface SearchProductHit {
  id: string
  sku: string | null
  barcode: string | null
  name_ar: string
  name_en: string
  /** One slug per product, identical in every locale. Pass it straight to `catalog.products.get`. */
  slug: string
  brand: SearchTaxonomyRef
  category: SearchTaxonomyRef
  from_price: Money
}

export interface MediaVariant {
  rendition: string
  width: number | null
  height: number | null
  byte_size: number | null
}

/**
 * A stored media asset, as the staff side models one.
 *
 * No customer-facing endpoint returns one: store settings carry asset UUIDs and the resolution
 * endpoint is staff-only, so this type exists to describe the shape rather than to be produced by
 * a client method. Catalog pictures are not this type; they come back as `Image`.
 */
export interface MediaAsset {
  id: string
  owner_type: string
  owner_id: string
  visibility: string
  status: string
  content_type: string
  byte_size: number
  checksum: string
  position: number | null
  alt_ar: string | null
  alt_en: string | null
  url: string | null
  processing_attempts: number
  failure_reason: string | null
  variants: MediaVariant[]
  created_at: string | null
}

/* -------------------------------------------------------------------------- */
/* Cart                                                                        */
/* -------------------------------------------------------------------------- */

export interface CartLine {
  id: string
  variant_id: string
  sku: string
  name_ar: string
  name_en: string
  /** Reserved. Release 1 only ever sends and returns `{}`. */
  option_selection: Record<string, unknown>
  quantity: number
  unit_price: Money
  line_total: Money
  purchasable: boolean
}

export interface CartAdjustment {
  /** e.g. `merged_quantity_summed`. */
  reason: string
  line_id: string | null
  variant_id: string | null
  previous_quantity: number | null
  quantity: number
}

export interface Cart {
  /** `null` when the caller has no cart yet — the API answers a zeroed cart rather than a 404. */
  id: string | null
  status: string
  is_guest: boolean
  /**
   * Returned exactly once, in the 201 that creates a guest cart. Every later response carries
   * `null`, and the server cannot reissue it. The client captures it automatically.
   */
  guest_token: string | null
  item_count: number
  subtotal: Money
  has_unpurchasable_lines: boolean
  lines: CartLine[]
  adjustments: CartAdjustment[]
  last_activity_at: string | null
}

export interface QuotedLine {
  line_id: string
  gross: Money
  discount: Money
  net: Money
}

export interface AppliedDiscount {
  discount_id: string
  name_ar: string
  name_en: string
  type: string
  scope: string
  coupon_code: string | null
  amount: Money
}

export interface RejectedDiscount {
  reason: string
  discount_id: string | null
  coupon_code: string | null
}

export interface CartQuote {
  subtotal: Money
  discount_total: Money
  discounted_subtotal: Money
  tax_amount: Money
  tax_rate_basis_points: number
  applied_discount: AppliedDiscount | null
  lines: QuotedLine[]
  rejected_discounts: RejectedDiscount[]
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export type CustomerIdentityType = 'email' | 'phone'

export interface CustomerIdentity {
  type: CustomerIdentityType
  /** Normalized by the server: lowercased email, or E.164 phone. */
  value: string
  verified_at: string | null
}

export interface Customer {
  id: string
  name: string
  identity: CustomerIdentity
}

/** Login result. There are no bearer tokens: identity rides the session cookie. */
export interface AuthSession {
  auth_type: string
  customer: Customer
}

/** Returned by flows that answer the same way whether or not an account exists. */
export interface AcceptedStatus {
  status: 'accepted'
}

export interface PasswordResetStatus {
  status: 'password_reset'
}

export interface SignedOutStatus {
  status: 'signed_out'
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

export interface GeoPosition {
  longitude: number
  latitude: number
}

export type AdministrativeAreaLevel = 'governorate' | 'city' | 'district'

/**
 * A row from `GET /customer/areas`.
 *
 * Both names are always present. Unlike the catalog, this list is not resolved to one locale, so
 * the caller picks the name for the locale it is rendering in.
 */
export interface AdministrativeArea {
  id: string
  level: AdministrativeAreaLevel
  code: string
  name_ar: string
  name_en: string
  source: string
  parent_id: string | null
  created_at: string
  updated_at: string
}

/** The area as it appears embedded in an address or a pickup location. */
export interface AdministrativeAreaRef {
  id: string
  level: string
  code: string
  name_ar: string
  name_en: string
}

export interface Address {
  id: string
  label: string
  recipient_name: string
  recipient_phone: string
  line_one: string
  line_two: string | null
  building: string | null
  floor: string | null
  apartment: string | null
  landmark: string | null
  is_default: boolean
  position: GeoPosition | null
  /** Only present when the server loaded the relation. */
  area: AdministrativeAreaRef | null
  created_at: string | null
  updated_at: string | null
}

export type FulfillmentMethod = 'delivery' | 'pickup'

export interface EtaWindow {
  minimum_minutes: number
  maximum_minutes: number
}

export interface FulfillmentQuote {
  method: FulfillmentMethod
  zone_id: string | null
  pickup_location_id: string | null
  rule_version: number
  subtotal: Money
  fee: Money
  minimum_order: Money
  free_threshold: Money | null
  free_threshold_applied: boolean
  eta: EtaWindow
  allowed_payment_methods: string[]
}

/** One weekly collection window. `day` is 0-6. */
export interface OperatingWindow {
  day: number
  /** `"HH:MM"`. */
  opens: string
  closes: string
}

export interface PickupLocation {
  id: string
  name_ar: string
  name_en: string
  address_line: string
  contact_phone: string | null
  ready: EtaWindow
  allowed_payment_methods: string[]
  /** An empty array means the location is always open. */
  operating_windows: OperatingWindow[]
  collection_instructions_ar: string | null
  collection_instructions_en: string | null
  is_active: boolean
  area: AdministrativeAreaRef | null
  created_at: string | null
  updated_at: string | null
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Not an enum. `cod` is always offered; `paymob` only when the store has the gateway configured.
 * Read the offered set from `store.settings()` -> `checkout.allowed_payment_methods`, or from a
 * fulfillment quote's `allowed_payment_methods`.
 */
export type PaymentMethod = 'cod' | 'paymob' | (string & {})

/** The customer an order or return belongs to, as embedded on those reads. */
export interface CustomerRef {
  id: string
  name: string
  phone: string
}

export interface OrderTotals {
  items_subtotal: Money
  discount_total: Money
  delivery_fee: Money
  total: Money
  tax_amount: Money
  tax_rate_basis_points: number
}

export interface OrderLine {
  id: string
  variant_id: string
  sku: string
  name_ar: string
  name_en: string
  option_selection: Record<string, unknown>
  quantity: number
  /** Frozen at placement. The catalog price may have moved since. */
  unit_price: Money
  line_total: Money
}

export interface OrderDiscountAllocation {
  order_line_id: string
  discount_id: string
  coupon_code: string | null
  name_ar: string
  name_en: string
  type: string
  scope: string
  value: number
  amount: Money
  schema_version: number
}

export interface PaymentAttempt {
  outcome: string
  driver: string
  reason: string | null
  occurred_at: string
}

export interface Payment {
  id: string
  method: PaymentMethod
  status: string
  amount: Money
  /**
   * Whether the buyer still has to go and pay. Stated by the server rather than inferred from the
   * method, because inferring it either strands a buyer on an unpaid order or sends a cash buyer
   * to a payment page that does not exist.
   */
  requires_action: boolean
  settled_at: string | null
  attempts: PaymentAttempt[]
}

export interface OrderFulfillment {
  id: string
  method: FulfillmentMethod
  status: string
  eta: EtaWindow
}

export interface OrderHistoryEntry {
  from_status: string | null
  to_status: string
  actor_type: string
  reason: string | null
  occurred_at: string
}

export interface Order {
  id: string
  number: string
  status: string
  placed_at: string
  customer: CustomerRef
  totals: OrderTotals
  fulfillment_method: FulfillmentMethod
  discount_allocations: OrderDiscountAllocation[]
  /** A frozen JSON snapshot of the delivery address; the contract does not pin its shape. */
  address: Record<string, unknown> | null
  /** A frozen JSON snapshot of the fulfillment quote; the contract does not pin its shape. */
  quote: Record<string, unknown>
  /** Never empty. An order is created from at least one cart line. */
  lines: OrderLine[]
  payment: Payment | null
  fulfillment: OrderFulfillment | null
  history: OrderHistoryEntry[]
}

/**
 * A short-lived, single-use provider redirect. Never persisted server-side, so it cannot be
 * re-read — start a new session instead. Nothing settles here; only the provider's signed webhook
 * marks a payment paid.
 */
export interface PaymentSession {
  type: string
  url: string
  reference: string
}

/* -------------------------------------------------------------------------- */
/* Returns                                                                     */
/* -------------------------------------------------------------------------- */

export type ReturnReason =
  | 'damaged'
  | 'wrong_item'
  | 'not_as_described'
  | 'missing_parts'
  | 'changed_mind'
  | 'other'

export interface ReturnLineRefundable {
  unit: Money
  requested: Money
  /** `null` until a person has inspected the goods. */
  accepted: Money | null
}

export interface ReturnLine {
  id: string
  order_line_id: string
  variant_id: string
  sku: string
  name_ar: string
  name_en: string
  /** What was asked for. */
  quantity: number
  /** What a person agreed had come back. `null` before inspection. */
  accepted_quantity: number | null
  reason: ReturnReason
  reason_note: string | null
  inspection_note: string | null
  refundable: ReturnLineRefundable
}

export interface ReturnPolicy {
  window_days: number
  delivered_at: string
  window_closes_at: string
  policy_url: string | null
}

export interface ReturnRefundable {
  requested: Money
  accepted: Money | null
}

/** Evidence as it appears embedded in a return: identifiers only, never a URL. */
export interface ReturnEvidenceSummary {
  id: string
  return_line_id: string | null
  content_type: string
  byte_size: number
  checksum: string
  uploaded_at: string
}

/**
 * Evidence as the upload and read-back endpoints return it, carrying a signed, expiring link.
 * The object key is never exposed: a key is an address that would outlive the authorization check.
 */
export interface ReturnEvidence extends ReturnEvidenceSummary {
  return_id: string
  url: string
  expires_in_minutes: number
}

export interface RefundAttempt {
  outcome: string
  driver: string
  driver_reference: string | null
  reason: string | null
  occurred_at: string
}

export interface Refund {
  id: string
  return_id: string
  order_id: string
  payment_id: string
  status: string
  method: string
  amount: Money
  provider_reference: string | null
  failure_reason: string | null
  settled_by_hand: boolean
  reason: string | null
  requested_at: string
  settled_at: string | null
  last_reconciled_at: string | null
  attempts: RefundAttempt[]
}

export interface ReturnHistoryEntry {
  from_status: string | null
  to_status: string
  actor_type: string
  reason: string | null
  occurred_at: string
}

export interface Return {
  id: string
  number: string
  status: string
  order_id: string
  order_number: string | null
  customer: CustomerRef
  /** The window as it stood when the return was opened — the answer to "how long did I have". */
  policy: ReturnPolicy
  refundable: ReturnRefundable
  requested_at: string
  resolved_at: string | null
  /** Never empty. A return is opened with at least one line. */
  lines: ReturnLine[]
  evidence: ReturnEvidenceSummary[]
  refunds: Refund[]
  history: ReturnHistoryEntry[]
}

/* -------------------------------------------------------------------------- */
/* Platform                                                                    */
/* -------------------------------------------------------------------------- */

export interface PlatformInfo {
  name: string
  api_version: string
}

export interface HealthStatus {
  status: string
}

export interface HealthChecks {
  postgresql: boolean
  valkey: boolean
  meilisearch: boolean
  store: boolean
}

export interface HealthReady {
  status: string
  checks: HealthChecks
  /** Only present once the store context resolves. */
  details?: {
    store_id: string
    store_status: string
  }
}
