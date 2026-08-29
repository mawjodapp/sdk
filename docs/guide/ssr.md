# Server-side rendering

The client runs on a server, but two things it takes for granted in a browser are missing there:
the cookie jar and `localStorage`.

If you are using [`@mawjod/nuxt`](/nuxt/ssr), all of this is already wired. Read this page anyway
for the one path that is not supported.

## Forwarding cookies

Identity is a Sanctum session cookie. In a browser, `credentials: 'include'` sends it and you never
think about it. On a server there is no jar. The cookie arrives on the incoming request, and you
have to put it on the outgoing one yourself.

That is what the `headers` option is for. Pass a function so it is resolved per request:

```ts
import { createMawjodClient } from '@mawjod/api'

export function clientForRequest(incoming: Request) {
  return createMawjodClient({
    baseUrl: process.env.MAWJOD_API_BASE!,
    // Annotate the return type: without it TypeScript infers a union that is not a HeadersInit.
    headers: (): Record<string, string> => {
      const cookie = incoming.headers.get('cookie')

      return cookie === null ? {} : { cookie }
    },
  })
}
```

The transport reads `XSRF-TOKEN` out of that forwarded `cookie` header when it cannot find one in a
jar, so a server-rendered write can satisfy Sanctum without a `/sanctum/csrf-cookie` round trip it
does not need.

::: danger One client per request
Never build a module-scope client on the server. It would capture one visitor's forwarded cookies
and hand them to the next visitor's render. Build one per request, or make `headers` a function that
reads from request-scoped storage.
:::

## Locale

`Accept-Language` decides which locale the catalog resolves to. During SSR, take it from the route
or from the incoming request, not from a process default:

```ts
createMawjodClient({
  baseUrl,
  locale: routeLocale, // 'ar' | 'en'
  headers: () => ({ cookie }),
})
```

`locale` is set before `headers`, so a `Accept-Language` you pass through `headers` overrides it.
That is intentional: the option is a default for the client, not a rule for every call it makes.

## Cart tokens on the server

The client's default storage is `localStorage` in a browser and in-memory everywhere else. In-memory
means "for the lifetime of this client object", which on a server is one request.

Reading a guest cart during SSR works if you can supply the token, for instance from a cookie your
theme writes itself:

```ts
createMawjodClient({
  baseUrl,
  headers: () => ({ cookie }),
  cartTokenStorage: memoryCartTokenStorage(tokenFromCookie),
})
```

## What is not supported

### Guest cart writes during SSR

A guest cart is created by a write, and that write is the only response that ever carries
`guest_token`. During SSR the token is captured into per-request storage, the render ends, and the
object is discarded before the browser ever learns the token. The cart exists and is permanently
unreachable.

That is deliberate: the server uses in-memory storage precisely so a token cannot be written
somewhere it would leak between requests. Do guest cart writes in the browser.

In practice that means an "add to cart" button submits from the client, not from a server route.
With `@mawjod/nuxt`, calling `useCart().addLine()` inside a server-rendered `setup()` for a signed-out
visitor is the shape to avoid.

Cart writes for a **signed-in** customer during SSR are fine, because that cart is addressed by the
session cookie you forwarded, not by a guest token.

### Bearer tokens for native apps

There are none. The storefront surface authenticates with a session cookie only, and a mobile token
scheme is explicitly not part of this release. A native app has to behave like a browser: keep a
cookie jar, call `/sanctum/csrf-cookie`, and echo `X-XSRF-TOKEN`.

### Guest checkout

Also none. Placing an order requires a signed-in, verified customer, on the server as much as in the
browser.

## What is safe to render on the server

| Call | SSR | Notes |
| --- | --- | --- |
| `store.get`, `store.settings` | yes | public, no cookies needed |
| `catalog.products.list`, `catalog.products.get` | yes | public |
| `search.products` | yes | public |
| `cart.get`, `cart.quote` | yes | needs the session cookie, or a supplied guest token |
| `cart.addLine` and other cart writes | signed-in only | guest writes strand the token |
| `auth.*` | no | logging in during SSR sets a cookie on the wrong response |
| `customer.*`, `orders.*`, `returns.*`, `fulfillment.*` | yes | with a forwarded cookie |
| `checkout.place`, `orders.pay` | avoid | a user action, not page data; also see below |
| `platform.*` | yes | infrastructure metadata |

Checkout during SSR is not blocked, but it is a poor fit: it is a button press, its retry semantics
depend on holding an idempotency pair across attempts, and a render that is retried by a framework
is exactly the wrong thing to attach it to. Place orders from the browser.

## Errors that look different on a server

`MawjodNetworkError` is more likely on a server: the API origin may not resolve from inside a
container, or TLS may fail against a self-signed development certificate. Check that `baseUrl` is
reachable from the server process, which is not necessarily the same host the browser reaches.

A `401` during SSR usually means the cookie was not forwarded, not that the shopper is signed out.
Confirm the `cookie` header is actually on the outgoing request before sending anyone to a login
page.
