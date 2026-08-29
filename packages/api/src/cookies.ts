/**
 * Cookie reads that survive server-side rendering.
 *
 * `document` does not exist on the server, so every read is guarded. An SSR consumer forwards the
 * incoming `Cookie` header through the client's `headers` option instead, and the transport reads
 * the token back out of that header.
 */
export function readCookie(name: string, jar?: string | null): string | null {
  const source = jar ?? (typeof document === 'undefined' ? null : document.cookie)

  if (source === null || source === '') {
    return null
  }

  const prefix = `${name}=`

  for (const part of source.split(';')) {
    const entry = part.trim()

    if (entry.startsWith(prefix)) {
      return entry.slice(prefix.length)
    }
  }

  return null
}

/**
 * Laravel stores `XSRF-TOKEN` URL-encoded. The header echo must be the decoded value, or Sanctum
 * answers 419.
 */
export function readXsrfToken(jar?: string | null): string | null {
  const raw = readCookie('XSRF-TOKEN', jar)

  if (raw === null) {
    return null
  }

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
