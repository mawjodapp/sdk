# `returns`

Return requests against delivered orders, with photo evidence and refund tracking. Every call
requires an authenticated customer.

```ts
mawjod.returns.list(query?)
mawjod.returns.get(returnId)
mawjod.returns.create(input)
mawjod.returns.cancel(returnId, input)
mawjod.returns.addEvidence(returnId, input)
mawjod.returns.getEvidence(returnId, evidenceId)
```

## `returns.list()`

```ts
list(query?: ReturnsQuery): Promise<Paginated<Return>>
```

`GET /api/v1/customer/returns`.

```ts
type ReturnsQuery = {
  page?: { number?: number | null; size?: number | null }
  sort?: string | string[] | null
  filter?: {
    status?: ReturnStatus[] | ReturnStatus
    requested_at?: { from?: string | number | boolean | null; to?: string | number | boolean | null }
    order_id?: string
    number?: string
    q?: string
  }
}

type ReturnStatus =
  | 'requested' | 'approved' | 'rejected' | 'cancelled'
  | 'received' | 'accepted' | 'refused'
  | (string & {})
```

The list is newest-first. `sort` is accepted but no alternate keys are documented, so treat the
default ordering as the contract.

`filter.q` is free text over the return number, the source order number, and the customer's name and
phone. Any filter key not listed is `422`.

Like orders, the list runs the payload integrity guard over every row.

## `returns.get()`

```ts
get(returnId: string): Promise<Return>
```

`GET /api/v1/customer/returns/{returnId}`. Carries lines, evidence, refunds and history.

## `returns.create()`

```ts
create(input: CreateReturnInput): Promise<Return>
```

`POST /api/v1/customer/returns`. Returns `201`.

```ts
interface CreateReturnInput {
  order_id: string                  // must be a DELIVERED order
  lines: CreateReturnLineInput[]    // 1-50
  operation_id?: string             // UUIDv7; generated when omitted
}

interface CreateReturnLineInput {
  order_line_id: string
  quantity: number                  // 1-1000
  reason: ReturnReason
  note?: string | null              // up to 500
}

type ReturnReason =
  | 'damaged' | 'wrong_item' | 'not_as_described'
  | 'missing_parts' | 'changed_mind' | 'other'
```

```ts
const request = await mawjod.returns.create({
  order_id: order.id,
  lines: [{ order_line_id: line.id, quantity: 1, reason: 'damaged', note: 'Cracked in transit' }],
})
```

No money fields are accepted. The refund value is recomputed server-side from the frozen
order-line snapshot, so there is nothing for a theme to calculate or send.

The order must be delivered, and the window is measured from delivery, not from placement. Past
it, this is `409 return_window_closed`.

Retrying with the same `operation_id` returns the original return instead of opening a second one.

## `returns.cancel()`

```ts
cancel(returnId: string, input: CancelReturnInput): Promise<Return>
```

`POST /api/v1/customer/returns/{returnId}/cancel`.

```ts
interface CancelReturnInput {
  reason: string          // 3-500 characters
  operation_id?: string
}
```

Possible only while the return is `requested` or `approved`. Once the goods have been received, the
decision is not the shopper's any more. Otherwise this is
`409 return_transition_not_allowed`.

The result has `status: 'cancelled'` and `resolved_at` set.

## `returns.addEvidence()`

```ts
addEvidence(returnId: string, input: AddEvidenceInput): Promise<ReturnEvidence>
```

`POST /api/v1/customer/returns/{returnId}/evidence`. Returns `201`.

```ts
interface AddEvidenceInput {
  content_type: 'image/jpeg' | 'image/png' | 'image/webp'
  contents: string                  // base64, up to ~5MB decoded
  return_line_id?: string | null    // attach to one line instead of the whole return
  operation_id?: string
}
```

The bytes are decoded and verified as a real image. A file that is not one, including a renamed
extension, is `422 evidence_not_an_image`.

Base64 from a browser file input:

```ts
async function toBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

await mawjod.returns.addEvidence(returnId, {
  content_type: 'image/jpeg',
  contents: await toBase64(file),
  return_line_id: line.id,
})
```

The encoded string is capped at 6,991,530 characters, which is roughly 5MB of image. Resize before
uploading rather than discovering the limit at submit time.

Retrying with the same `operation_id` returns the original file rather than storing a duplicate.

## `returns.getEvidence()`

```ts
getEvidence(returnId: string, evidenceId: string): Promise<ReturnEvidence>
```

`GET /api/v1/customer/returns/{returnId}/evidence/{evidenceId}`. Re-signs the link.

Evidence storage is private and never addressable without a signature. The `url` you get is
short-lived; `expires_in_minutes` says how short. Once it expires, call this again for a fresh one.
Do not cache the URL.

Two checks gate access: ownership of both the return and the evidence, then the signature's own
expiry.

## `Return`

```ts
interface Return {
  id: string
  number: string
  status: string
  order_id: string
  order_number: string | null
  customer: CustomerRef
  policy: ReturnPolicy
  refundable: ReturnRefundable
  requested_at: string
  resolved_at: string | null
  lines: ReturnLine[]                  // never empty
  evidence: ReturnEvidenceSummary[]
  refunds: Refund[]
  history: ReturnHistoryEntry[]
}

interface ReturnPolicy {
  window_days: number
  delivered_at: string
  window_closes_at: string
  policy_url: string | null
}

interface ReturnRefundable {
  requested: Money
  accepted: Money | null    // null until a person has inspected the goods
}

interface ReturnLine {
  id: string
  order_line_id: string
  variant_id: string
  sku: string
  name_ar: string
  name_en: string
  quantity: number                   // what was asked for
  accepted_quantity: number | null   // what a person agreed came back; null before inspection
  reason: ReturnReason
  reason_note: string | null
  inspection_note: string | null
  refundable: { unit: Money; requested: Money; accepted: Money | null }
}
```

`customer` is the account the return belongs to, the same `CustomerRef` an order carries. See
[`orders`](/api/orders#order).

`policy` is the window as it stood when the return was opened: the answer to "how long did I have",
not "how long is the policy now".

The `accepted` fields being `null` is the normal pre-inspection state, not missing data. Render
"pending review" rather than a zero.

### Evidence shapes

```ts
// Embedded in a Return: identifiers only, never a URL.
interface ReturnEvidenceSummary {
  id: string
  return_line_id: string | null
  content_type: string
  byte_size: number
  checksum: string
  uploaded_at: string
}

// Returned by addEvidence and getEvidence: carries a signed, expiring link.
interface ReturnEvidence extends ReturnEvidenceSummary {
  return_id: string
  url: string
  expires_in_minutes: number
}
```

The object key is never exposed. A key is an address that would outlive the authorization check, so
only signed URLs leave the server. To show a gallery, list the summaries from the return and call
`getEvidence` for each one you actually display.

### `Refund`

```ts
interface Refund {
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
```

Refunds are created by staff as part of resolving a return; there is no customer-facing endpoint
that requests one directly. They appear on the return once they exist.

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `return_window_closed` | 409 | `create` |
| `return_transition_not_allowed` | 409 | `cancel` |
| `evidence_not_an_image` | 422 | `addEvidence` |
| `unauthenticated` | 401 | everywhere |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere |
| `store_unavailable` | 503 | everywhere |

`PayloadIntegrityError` is thrown by `list`, `get`, `create` and `cancel`.

## In Nuxt

```ts
const { returns, create, cancel, addEvidence, getEvidence, mutating } = useReturns()
```

::: tip
`useReturns()` fetches the list on setup. Pass `{ immediate: false }` when a page only needs the
mutation methods:

```ts
const { create } = useReturns(undefined, { immediate: false })
```
:::

See [Composables → useReturns](/nuxt/composables#usereturns).
