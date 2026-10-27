import type { Transport } from '../http.js'
import type { AdministrativeArea, Paginated, PublicVendor, VendorApplication } from '../types.js'
import type { AreasQuery } from './customer.js'

export interface VendorSignupCodeInput {
  /** Where the six-digit code goes. It becomes the owner's sign-in. */
  email: string
}

/** Everything a business states when it applies. Max lengths match the server's. */
export interface VendorSignupInput extends VendorSignupCodeInput {
  /** The six digits from the email. Ten minutes, five wrong tries. */
  code: string
  /** The person who will own the vendor's account. Up to 160 characters. */
  owner_name: string
  name_ar: string
  name_en: string
  /** Optional; empty clears it. Up to 2000 characters. */
  about_ar?: string | null
  about_en?: string | null
  contact_email: string
  /** E.164, e.g. `+201000000002`. */
  contact_phone: string
  /** From `marketplace.vendorSignup.areas()`. */
  area_id: string
  /** Street and building. Up to 200 characters. */
  address_line: string
  /** The registered company name. */
  legal_name: string
  commercial_register_no: string
  tax_registration_no: string
}

/**
 * `/marketplace/*`. A single shop answers every call with `404 not_found`, and a marketplace
 * with `marketplace.vendor_registration` closed refuses the signup calls with `403
 * vendor_registration_closed`. No session needed.
 */
export interface MarketplaceNamespace {
  vendorSignup: {
    /**
     * Emails a six-digit code. Always succeeds while registration is open, whether or not the
     * address is free, so it cannot be used to find out who has an account.
     */
    sendCode(input: VendorSignupCodeInput): Promise<void>
    /**
     * Uses the code and files the application. `422 vendor_signup_code_invalid` for a wrong,
     * expired or used-up code; `409 vendor_email_unavailable` when the address already has an
     * account. The vendor is `pending` until an admin decides, unless the marketplace approves
     * on its own. Either way the owner gets an email to set a password once approved.
     */
    apply(input: VendorSignupInput): Promise<VendorApplication>
    /** The areas a business can be in, for `area_id`. */
    areas(query?: AreasQuery): Promise<Paginated<AdministrativeArea>>
  }
  vendors: {
    /**
     * A seller's public page by slug. `404 not_found` for a seller that is not approved, is
     * suspended, or does not exist. List its products with
     * `catalog.products.list({ filter: { vendor: slug } })`.
     */
    get(slug: string): Promise<PublicVendor>
  }
}

export function createMarketplaceNamespace(transport: Transport): MarketplaceNamespace {
  return {
    vendorSignup: {
      sendCode: async (input) => {
        await transport.data<{ sent: boolean }>({
          method: 'POST',
          path: '/marketplace/vendor-signup/code',
          body: input,
        })
      },
      apply: (input) =>
        transport.data<VendorApplication>({ method: 'POST', path: '/marketplace/vendor-signup', body: input }),
      areas: (query) =>
        transport.list<AdministrativeArea>({ method: 'GET', path: '/marketplace/vendor-signup/areas', query }),
    },
    vendors: {
      get: (slug) =>
        transport.data<PublicVendor>({ method: 'GET', path: `/marketplace/vendors/${encodeURIComponent(slug)}` }),
    },
  }
}
