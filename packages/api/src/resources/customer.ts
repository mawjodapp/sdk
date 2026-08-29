import type { Transport } from '../http.js'
import type { SortValue } from '../query.js'
import type {
  Address,
  AdministrativeArea,
  AdministrativeAreaLevel,
  Customer,
  GeoPosition,
  Paginated,
} from '../types.js'

export interface UpdateProfileInput {
  /** Up to 120 characters. The verified identity is not editable here. */
  name: string
}

/** POST and PUT take the identical shape: PUT is a full replace, not a patch. */
export interface AddressInput {
  area_id: string
  label: string
  recipient_name: string
  /** E.164, e.g. `+201234567890`. */
  recipient_phone: string
  line_one: string
  line_two?: string | null
  building?: string | null
  floor?: string | null
  apartment?: string | null
  landmark?: string | null
  position: GeoPosition
  is_default?: boolean
}

export type AreasQuery = {
  page?: { number?: number | null; size?: number | null }
  /** `code`, `created_at` or `updated_at`, optionally `-` prefixed. */
  sort?: SortValue
  filter?: {
    /**
     * One level, never a set. The server refuses `filter[level]=city,district` with a 422, so this
     * is typed as a single string and the comma form cannot be written.
     */
    level?: AdministrativeAreaLevel
    /** A single area UUIDv7. Anything else is a 422. */
    parent?: string
  }
}

export interface CustomerNamespace {
  profile: {
    get(): Promise<Customer>
    update(input: UpdateProfileInput): Promise<Customer>
  }
  addresses: {
    /** Not paginated. */
    list(): Promise<Address[]>
    create(input: AddressInput): Promise<Address>
    /** A full replace — every required field must be present, not just the changed ones. */
    update(addressId: string, input: AddressInput): Promise<Address>
    remove(addressId: string): Promise<void>
  }
  areas: {
    /**
     * The administrative areas an address may point at. Paginated, and never resolved to one
     * locale: every row carries `name_ar` and `name_en`.
     */
    list(query?: AreasQuery): Promise<Paginated<AdministrativeArea>>
  }
}

export function createCustomerNamespace(transport: Transport): CustomerNamespace {
  return {
    profile: {
      get: () => transport.data<Customer>({ method: 'GET', path: '/customer/profile' }),
      update: (input) =>
        transport.data<Customer>({ method: 'PATCH', path: '/customer/profile', body: input }),
    },
    addresses: {
      list: () => transport.array<Address>({ method: 'GET', path: '/customer/addresses' }),
      create: (input) =>
        transport.data<Address>({ method: 'POST', path: '/customer/addresses', body: input }),
      update: (addressId, input) =>
        transport.data<Address>({
          method: 'PUT',
          path: `/customer/addresses/${encodeURIComponent(addressId)}`,
          body: input,
        }),
      remove: (addressId) =>
        transport.none({
          method: 'DELETE',
          path: `/customer/addresses/${encodeURIComponent(addressId)}`,
        }),
    },
    areas: {
      list: (query) =>
        transport.list<AdministrativeArea>({ method: 'GET', path: '/customer/areas', query }),
    },
  }
}
