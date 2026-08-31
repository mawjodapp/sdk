import type { CartTokenStorage } from './cart-token.js'
import { readXsrfToken } from './cookies.js'
import { MawjodApiError, MawjodNetworkError, type ProblemDocument } from './errors.js'
import { appendQuery, type QueryInput } from './query.js'
import type { ApiMeta, Paginated, PaginationLinks, PaginationMeta, SearchMeta, SearchResults } from './types.js'

const API_PREFIX = '/api/v1'
const CSRF_PATH = '/sanctum/csrf-cookie'
const CART_TOKEN_HEADER = 'X-Mawjod-Cart-Token'
const CSRF_HEADER = 'X-XSRF-TOKEN'
const UNSAFE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const EMPTY_LINKS: PaginationLinks = { first: null, last: null, prev: null, next: null }

export type HeadersOption = HeadersInit | (() => HeadersInit | Promise<HeadersInit>)

export interface TransportOptions {
  baseUrl: string
  fetch: typeof globalThis.fetch
  headers: HeadersOption | undefined
  locale: string | undefined
  onError: ((error: MawjodApiError) => void) | undefined
  cartTokenStorage: CartTokenStorage
}

export interface RequestSpec {
  method: string
  /** Relative to `/api/v1`, e.g. `/cart/lines`. */
  path: string
  query?: QueryInput | null
  body?: unknown
  headers?: Record<string, string>
}

interface ParsedResponse {
  status: number
  body: unknown
}

/**
 * The request pipeline: CSRF bootstrap, guest cart token, problem+json mapping, envelope
 * unwrapping. Every namespace method goes through it.
 */
export class Transport {
  private csrf: Promise<void> | null = null

  constructor(private readonly options: TransportOptions) {}

  /** The parsed `data` of a single-resource envelope. */
  async data<T>(spec: RequestSpec): Promise<T> {
    const { data } = await this.dataWithMeta<T>(spec)

    return data
  }

  /**
   * `data` plus `meta`. Used where the request id has to survive into an error the caller sees:
   * the payload integrity guard, in practice.
   */
  async dataWithMeta<T>(spec: RequestSpec): Promise<{ data: T; meta: ApiMeta | null }> {
    const { body } = await this.send(spec)

    if (!isRecord(body) || !('data' in body)) {
      throw new MawjodNetworkError(
        `The response to ${spec.method} ${spec.path} carried no data envelope.`,
        { url: this.url(spec) },
      )
    }

    return { data: body['data'] as T, meta: isRecord(body['meta']) ? (body['meta'] as unknown as ApiMeta) : null }
  }

  /** A paginated collection: `data` plus `links` and pagination `meta`. */
  async list<T>(spec: RequestSpec): Promise<Paginated<T>> {
    const { body, items } = await this.collection<T>(spec)

    return {
      data: items,
      links: isRecord(body['links']) ? (body['links'] as unknown as PaginationLinks) : EMPTY_LINKS,
      meta: body['meta'] as PaginationMeta,
    }
  }

  /** A search collection, whose `meta` adds `engine`, `exhaustive_total` and `facets`. */
  async search<T>(spec: RequestSpec): Promise<SearchResults<T>> {
    const { body, items } = await this.collection<T>(spec)

    return {
      data: items,
      links: isRecord(body['links']) ? (body['links'] as unknown as PaginationLinks) : EMPTY_LINKS,
      meta: body['meta'] as SearchMeta,
    }
  }

  /** A bare `data: []` collection. Addresses and pickup locations are not paginated. */
  async array<T>(spec: RequestSpec): Promise<T[]> {
    const { items } = await this.collection<T>(spec)

    return items
  }

  /** A call whose success carries no body, e.g. `DELETE /customer/addresses/{id}` -> 204. */
  async none(spec: RequestSpec): Promise<void> {
    await this.send(spec)
  }

  async readCartToken(): Promise<string | null> {
    return this.options.cartTokenStorage.get()
  }

  /**
   * Forget the stored guest cart token. Called after a successful merge or logout: the guest cart
   * no longer exists, and replaying a dead token on the next add-to-cart would be noise.
   */
  async clearCartToken(): Promise<void> {
    await this.options.cartTokenStorage.set(null)
  }

  private async collection<T>(spec: RequestSpec): Promise<{ body: Record<string, unknown>; items: T[] }> {
    const { body } = await this.send(spec)

    if (!isRecord(body) || !Array.isArray(body['data'])) {
      throw new MawjodNetworkError(
        `The response to ${spec.method} ${spec.path} carried no data collection.`,
        { url: this.url(spec) },
      )
    }

    return { body, items: body['data'] as T[] }
  }

  private async send(spec: RequestSpec): Promise<ParsedResponse> {
    return this.execute(spec, false)
  }

  private async execute(spec: RequestSpec, isRetry: boolean): Promise<ParsedResponse> {
    const method = spec.method.toUpperCase()
    const unsafe = UNSAFE_METHODS.has(method)

    if (unsafe) {
      await this.ensureCsrf(false)
    }

    const url = this.url(spec)
    const headers = await this.buildHeaders(spec, unsafe)

    let response: Response

    try {
      response = await this.options.fetch(url, {
        method,
        headers,
        credentials: 'include',
        body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
      })
    } catch (cause) {
      throw new MawjodNetworkError(`${method} ${url} could not be reached.`, { url, cause })
    }

    // 419 is Laravel's "CSRF token mismatch". The token expired with the session; refresh once and
    // replay once. A second 419 is a real failure, not a race.
    if (response.status === 419 && unsafe && !isRetry) {
      await this.ensureCsrf(true)

      return this.execute(spec, true)
    }

    return this.parse(response, url, method)
  }

  private async parse(response: Response, url: string, method: string): Promise<ParsedResponse> {
    const status = response.status

    if (status === 204 || status === 205) {
      return { status, body: null }
    }

    let text: string

    try {
      text = await response.text()
    } catch (cause) {
      throw new MawjodNetworkError(`The response to ${method} ${url} could not be read.`, {
        url,
        status,
        cause,
      })
    }

    let body: unknown = null
    let parsed = text === ''

    if (text !== '') {
      try {
        body = JSON.parse(text)
        parsed = true
      } catch {
        parsed = false
      }
    }

    if (!response.ok) {
      throw this.failure(body, parsed, status, url, method)
    }

    if (!parsed) {
      throw new MawjodNetworkError(`${method} ${url} answered ${status} with a body that is not JSON.`, {
        url,
        status,
      })
    }

    await this.captureCartToken(body)

    return { status, body }
  }

  private failure(
    body: unknown,
    parsed: boolean,
    status: number,
    url: string,
    method: string,
  ): MawjodApiError | MawjodNetworkError {
    if (parsed && isRecord(body) && typeof body['code'] === 'string') {
      const problem: ProblemDocument = {
        ...body,
        code: body['code'],
        status: typeof body['status'] === 'number' ? body['status'] : status,
      }

      const error = new MawjodApiError(problem)

      this.options.onError?.(error)

      return error
    }

    // Not problem+json: a proxy, a gateway, or an unhandled server fault. It carries no `code` and
    // no request id, so there is nothing to branch on.
    return new MawjodNetworkError(`${method} ${url} failed with ${status} and no problem document.`, {
      url,
      status,
    })
  }

  private async buildHeaders(spec: RequestSpec, unsafe: boolean): Promise<Headers> {
    const headers = new Headers({ Accept: 'application/json' })

    // Set first so both `options.headers` and a per-request header can override it: the locale is
    // a default for the client, not a rule for every call it makes.
    if (this.options.locale !== undefined && this.options.locale !== '') {
      headers.set('Accept-Language', this.options.locale)
    }

    const supplied = await resolveHeaders(this.options.headers)

    if (supplied !== null) {
      new Headers(supplied).forEach((value, key) => {
        headers.set(key, value)
      })
    }

    for (const [key, value] of Object.entries(spec.headers ?? {})) {
      headers.set(key, value)
    }

    if (spec.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    if (unsafe && !headers.has(CSRF_HEADER)) {
      // On the server there is no cookie jar, so fall back to the `Cookie` header the SSR consumer
      // forwarded. Without this an SSR write can never satisfy Sanctum.
      const token = readXsrfToken() ?? readXsrfToken(headers.get('cookie'))

      if (token !== null) {
        headers.set(CSRF_HEADER, token)
      }
    }

    if (isCartPath(spec.path) && !headers.has(CART_TOKEN_HEADER)) {
      const token = await this.options.cartTokenStorage.get()

      if (token !== null && token !== '') {
        headers.set(CART_TOKEN_HEADER, token)
      }
    }

    return headers
  }

  /**
   * Bootstraps the CSRF cookie before the first unsafe request, once.
   *
   * When a token is already readable the network call is skipped. A stale one self-heals through
   * the 419 retry above, which is cheaper than a round trip before every session's first write.
   */
  private async ensureCsrf(force: boolean): Promise<void> {
    if (force) {
      this.csrf = null
    }

    this.csrf ??= this.bootstrapCsrf(force)

    try {
      await this.csrf
    } catch (error) {
      this.csrf = null
      throw error
    }
  }

  private async bootstrapCsrf(force: boolean): Promise<void> {
    if (!force && (await this.readableXsrfToken()) !== null) {
      return
    }

    const url = joinUrl(this.options.baseUrl, CSRF_PATH)

    let response: Response

    try {
      response = await this.options.fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
    } catch (cause) {
      throw new MawjodNetworkError(`The CSRF cookie endpoint at ${url} could not be reached.`, {
        url,
        cause,
      })
    }

    // This route sits outside /api/v1 and does not speak problem+json, so anything but 204 is a
    // transport failure. Retry the CSRF call, not the write that triggered it.
    if (response.status !== 204) {
      throw new MawjodNetworkError(
        `The CSRF cookie endpoint answered ${response.status}; expected 204.`,
        { url, status: response.status },
      )
    }
  }

  /**
   * The token this client could actually echo, from either source it has: the browser's cookie
   * jar, or the `Cookie` header an SSR consumer forwards. Checking both means a server-rendered
   * write does not pay for a `/sanctum/csrf-cookie` round trip it does not need.
   */
  private async readableXsrfToken(): Promise<string | null> {
    const fromJar = readXsrfToken()

    if (fromJar !== null) {
      return fromJar
    }

    const supplied = await resolveHeaders(this.options.headers)

    if (supplied === null) {
      return null
    }

    return readXsrfToken(new Headers(supplied).get('cookie'))
  }

  /**
   * A guest cart token appears exactly once, in the response that creates the cart. Capture it or
   * the cart becomes unreachable. Never overwrite a stored token with the `null` that every later
   * response carries.
   */
  private async captureCartToken(body: unknown): Promise<void> {
    if (!isRecord(body)) {
      return
    }

    const data = body['data']

    if (!isRecord(data)) {
      return
    }

    const token = data['guest_token']

    if (typeof token === 'string' && token !== '') {
      await this.options.cartTokenStorage.set(token)
    }
  }

  private url(spec: RequestSpec): string {
    return joinUrl(this.options.baseUrl, appendQuery(`${API_PREFIX}${spec.path}`, spec.query))
  }
}

async function resolveHeaders(headers: HeadersOption | undefined): Promise<HeadersInit | null> {
  if (headers === undefined) {
    return null
  }

  if (typeof headers === 'function') {
    return headers()
  }

  return headers
}

function isCartPath(path: string): boolean {
  return path === '/cart' || path.startsWith('/cart/')
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
