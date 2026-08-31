import type { Transport } from '../http.js'
import { guardReturn, guardReturns } from '../integrity.js'
import type { FilterRange, SortValue } from '../query.js'
import type { Paginated, Return, ReturnEvidence, ReturnReason } from '../types.js'
import { uuidv7 } from '../uuid.js'

export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'received'
  | 'accepted'
  | 'refused'
  | (string & {})

export type ReturnsQuery = {
  page?: { number?: number | null; size?: number | null }
  sort?: SortValue
  filter?: {
    status?: ReturnStatus[] | ReturnStatus
    /** Inclusive. A bare date means the whole day in the store's timezone. */
    requested_at?: FilterRange
    /** Scope to one order. */
    order_id?: string
    /** Exact return number. */
    number?: string
    /** Free text over return number, source order number, customer name and phone. */
    q?: string
  }
}

export interface CreateReturnLineInput {
  order_line_id: string
  /** 1-1000. */
  quantity: number
  reason: ReturnReason
  note?: string | null
}

export interface CreateReturnInput {
  /** Must be a *delivered* order; the window is measured from delivery, not placement. */
  order_id: string
  /** 1-50 lines. */
  lines: CreateReturnLineInput[]
  /** UUIDv7. Retrying with the same value returns the original return instead of a second one. */
  operation_id?: string
}

export interface CancelReturnInput {
  /** 3-500 characters. */
  reason: string
  operation_id?: string
}

export interface AddEvidenceInput {
  content_type: 'image/jpeg' | 'image/png' | 'image/webp'
  /** Base64, up to ~5MB decoded. The bytes are decoded and verified as a real image. */
  contents: string
  /** Attach to one return line instead of the whole return. */
  return_line_id?: string | null
  operation_id?: string
}

export interface ReturnsNamespace {
  list(query?: ReturnsQuery): Promise<Paginated<Return>>
  get(returnId: string): Promise<Return>
  /**
   * Requests a return. No money fields are accepted: the refund value is recomputed from the
   * frozen order-line snapshot. Past the window this is `409 return_window_closed`.
   */
  create(input: CreateReturnInput): Promise<Return>
  /** Withdraws a return, possible only while it is `requested` or `approved`. */
  cancel(returnId: string, input: CancelReturnInput): Promise<Return>
  /** Attaches a photo. Storage is private; the response carries a signed, expiring link. */
  addEvidence(returnId: string, input: AddEvidenceInput): Promise<ReturnEvidence>
  /** Re-signs the link to one photo. The old URL is not reusable once it expires. */
  getEvidence(returnId: string, evidenceId: string): Promise<ReturnEvidence>
}

export function createReturnsNamespace(transport: Transport): ReturnsNamespace {
  return {
    list: async (query) => {
      const page = await transport.list<Return>({ method: 'GET', path: '/customer/returns', query })

      guardReturns(page.data, page.meta)

      return page
    },

    get: async (returnId) => {
      const { data, meta } = await transport.dataWithMeta<Return>({
        method: 'GET',
        path: `/customer/returns/${encodeURIComponent(returnId)}`,
      })

      return guardReturn(data, meta)
    },

    create: async (input) => {
      const { data, meta } = await transport.dataWithMeta<Return>({
        method: 'POST',
        path: '/customer/returns',
        body: { ...input, operation_id: input.operation_id ?? uuidv7() },
      })

      return guardReturn(data, meta)
    },

    cancel: async (returnId, input) => {
      const { data, meta } = await transport.dataWithMeta<Return>({
        method: 'POST',
        path: `/customer/returns/${encodeURIComponent(returnId)}/cancel`,
        body: { ...input, operation_id: input.operation_id ?? uuidv7() },
      })

      return guardReturn(data, meta)
    },

    addEvidence: (returnId, input) =>
      transport.data<ReturnEvidence>({
        method: 'POST',
        path: `/customer/returns/${encodeURIComponent(returnId)}/evidence`,
        body: { ...input, operation_id: input.operation_id ?? uuidv7() },
      }),

    getEvidence: (returnId, evidenceId) =>
      transport.data<ReturnEvidence>({
        method: 'GET',
        path: `/customer/returns/${encodeURIComponent(returnId)}/evidence/${encodeURIComponent(evidenceId)}`,
      }),
  }
}
