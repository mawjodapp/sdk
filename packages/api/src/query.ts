/**
 * One query serializer, used by every list endpoint.
 *
 * The API's contract is not uniform, so neither is the input:
 * - paginated resources take `page[number]` / `page[size]`
 * - `GET /search/products` takes flat `page` / `per_page` and *prohibits* `filter` entirely
 * - filters are sets (`filter[status]=a,b`), inclusive ranges (`filter[k][from]` / `[to]`) or scalars
 */

export type QueryScalar = string | number | boolean

/** An inclusive range. A bare date means the whole day in the store's timezone. */
export interface FilterRange {
  from?: QueryScalar | null
  to?: QueryScalar | null
}

export type FilterValue = QueryScalar | QueryScalar[] | FilterRange | null | undefined

/** `'-placed_at'` sorts descending. An array is joined with commas, in order. */
export type SortValue = string | string[] | null | undefined

/** An object becomes `page[number]`/`page[size]`; a bare number becomes flat `page` (search only). */
export type PageValue = number | { number?: number | null; size?: number | null } | null | undefined

export interface QueryInput {
  page?: PageValue
  sort?: SortValue
  filter?: Record<string, FilterValue> | null
  /** Endpoint-specific scalars, e.g. `q`, `category_id`, `per_page`. */
  [key: string]: unknown
}

/**
 * Returns an encoded query string with no leading `?`.
 *
 * `null`, `undefined` and empty strings are dropped rather than sent: the API answers 422 for a
 * blank `filter[q]`, and "the user cleared the box" should not become a validation error.
 */
export function buildQuery(input?: QueryInput | null): string {
  if (input === undefined || input === null) {
    return ''
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue
    }

    if (key === 'page') {
      appendPage(params, value as PageValue)
      continue
    }

    if (key === 'sort') {
      appendSort(params, value as SortValue)
      continue
    }

    if (key === 'filter') {
      appendFilter(params, value as Record<string, FilterValue>)
      continue
    }

    appendScalar(params, key, value)
  }

  return params.toString()
}

/** Joins a path with its serialized query. */
export function appendQuery(path: string, input?: QueryInput | null): string {
  const query = buildQuery(input)

  if (query === '') {
    return path
  }

  return `${path}${path.includes('?') ? '&' : '?'}${query}`
}

function appendPage(params: URLSearchParams, value: PageValue): void {
  if (typeof value === 'number') {
    params.set('page', String(value))
    return
  }

  if (typeof value !== 'object' || value === null) {
    return
  }

  if (value.number !== undefined && value.number !== null) {
    params.set('page[number]', String(value.number))
  }

  if (value.size !== undefined && value.size !== null) {
    params.set('page[size]', String(value.size))
  }
}

function appendSort(params: URLSearchParams, value: SortValue): void {
  const joined = Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry !== '').join(',')
    : value

  if (typeof joined === 'string' && joined !== '') {
    params.set('sort', joined)
  }
}

function appendFilter(params: URLSearchParams, filter: Record<string, FilterValue>): void {
  for (const [name, value] of Object.entries(filter)) {
    if (value === undefined || value === null) {
      continue
    }

    if (Array.isArray(value)) {
      const joined = value.map(String).join(',')

      if (joined !== '') {
        params.set(`filter[${name}]`, joined)
      }

      continue
    }

    if (typeof value === 'object') {
      if (value.from !== undefined && value.from !== null && value.from !== '') {
        params.set(`filter[${name}][from]`, String(value.from))
      }

      if (value.to !== undefined && value.to !== null && value.to !== '') {
        params.set(`filter[${name}][to]`, String(value.to))
      }

      continue
    }

    if (value !== '') {
      params.set(`filter[${name}]`, String(value))
    }
  }
}

function appendScalar(params: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    const joined = value
      .filter((entry): entry is QueryScalar => entry !== null && entry !== undefined)
      .map(String)
      .join(',')

    if (joined !== '') {
      params.set(key, joined)
    }

    return
  }

  if (typeof value === 'string') {
    if (value !== '') {
      params.set(key, value)
    }

    return
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    params.set(key, String(value))
  }
}
