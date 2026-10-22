/**
 * Where a vendor stands with the marketplace. Only `approved` sells; a `suspended` vendor's staff
 * can still sign in and look, but change nothing.
 *
 * Compare against these rather than spelling the strings: `vendor.status === VendorStatus.Pending`.
 */
export const VendorStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
  Suspended: 'suspended',
} as const

export type VendorStatus = (typeof VendorStatus)[keyof typeof VendorStatus]

/** The values of the public `marketplace.vendor_registration` setting. */
export const VendorRegistration = {
  Open: 'open',
  Closed: 'closed',
} as const

export type VendorRegistration = (typeof VendorRegistration)[keyof typeof VendorRegistration]

/** Marketplace setting keys, as `store.settings()` returns them. Absent from a single shop. */
export const MarketplaceSettingKey = {
  VendorRegistration: 'marketplace.vendor_registration',
} as const

export type MarketplaceSettingKey = (typeof MarketplaceSettingKey)[keyof typeof MarketplaceSettingKey]
