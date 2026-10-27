/**
 * How the deployment sells: one shop, or a marketplace whose vendors sell inside it. Fixed at
 * install, so read it once and keep it.
 *
 * Compare against these rather than spelling the strings: `store.mode === StoreMode.Marketplace`.
 */
export const StoreMode = {
  Single: 'single',
  Marketplace: 'marketplace',
} as const

export type StoreMode = (typeof StoreMode)[keyof typeof StoreMode]
