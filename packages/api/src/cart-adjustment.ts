/**
 * Why a cart line changed between what the caller last saw and what the server now says. Read from
 * `cart.adjustments[].reason`: `cart.adjustments.some((a) => a.reason === CartAdjustmentReason.ReplacedOnMerge)`.
 */
export const CartAdjustmentReason = {
  PriceChanged: 'price_changed',
  Unavailable: 'unavailable',
  QuantityReduced: 'quantity_reduced',
  Removed: 'removed',
  MergedQuantitySummed: 'merged_quantity_summed',
  /** Marketplace: the guest cart replaced the shopper's saved cart at sign-in. */
  ReplacedOnMerge: 'replaced_on_merge',
} as const

export type CartAdjustmentReason = (typeof CartAdjustmentReason)[keyof typeof CartAdjustmentReason]
