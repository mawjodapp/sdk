# Server-side rendering

What the module wires for you, what it deliberately does not, and where the hydration boundary sits.

For the underlying mechanics (cookie forwarding, locale, cart tokens on a server), see
[SSR](/guide/ssr) in the guide.

## One client per app instance

The plugin builds one `@mawjod/api` client per Nuxt app instance: per request on the server, per page
load in the browser.

Never a module-scope singleton. On the server that would capture one visitor's forwarded cookies and
hand them to the next visitor's request, a session leak that would be invisible in development,
where there is only ever one visitor.

## Cookie forwarding

During SSR there is no cookie jar, so the incoming `cookie` header is the only carrier of the Sanctum
session and the `XSRF-TOKEN` the client echoes on writes. The plugin forwards it:

```ts
const forwardHeaders = server ? useRequestHeaders(['cookie']) : undefined
```

Only `cookie`, and only on the server. In the browser this would be redundant:
`credentials: 'include'` already sends them.

The transport reads `XSRF-TOKEN` out of that forwarded header when it cannot find one in a jar, so a
server-rendered write can satisfy Sanctum without a `/sanctum/csrf-cookie` round trip it does not
need.

## Locale

The client's `locale` is a function, not a static value, resolved per request. That is what lets
`useMawjodLocale()` change the locale after the client was built:

```ts
const mawjodLocale = useMawjodLocale()

mawjodLocale.value = 'en' // the next call sends Accept-Language: en
```

`useMawjodLocale()` is backed by `useState`, so a locale chosen during SSR survives hydration.

## Cart token storage

| Where | Storage |
| --- | --- |
| Server | in-memory, per request |
| Browser | `localStorage` under `mawjod:cart_token` |

In the browser the token belongs in `localStorage` so it survives reloads. On the server it must
not: a token written to anything longer-lived than one request would leak between visitors.

## Store availability

The plugin wires the client's `onError` to the shared availability state, so any
`store_unavailable` failure, during SSR or after hydration, flips one flag.

The state is plain and serializable, so an outage detected during SSR is carried through the payload
and stays rendered after hydration instead of flashing.

## What crosses the hydration boundary

There are two kinds of state, on purpose.

`useState` is serialized into the SSR payload and survives hydration:

```
mawjod:locale
mawjod:store-availability
mawjod:cart
mawjod:cart-quote
mawjod:customer
```

Per-app-instance refs are never written to the payload: in-flight flags, error refs, the checkout
attempt pair, search query and results, the last fulfillment quote, the post-login merge error.

`useState` is the right home for anything that must survive hydration, but it has to serialize.
Errors, in-flight flags and idempotency key pairs must not leak from one visitor's request into
another's, and a module-scope `ref()` would do exactly that on the server. Those get a lifetime that
matches the app instance instead.

The practical consequence: after hydration, `pending` is `false`, `error` is `null` and
`useCheckout().attempt` is `null`, whatever happened during the render. Anything you need on the
other side has to come from `useState` or be refetched.

## What the module does not do

### Guest cart writes during SSR

A guest cart is created by a write, and that write is the only response that ever carries
`guest_token`. During SSR the token goes into per-request memory, the render ends, and the browser
never learns it. The cart exists and is permanently unreachable.

That is deliberate: the server gets in-memory storage precisely so a token cannot be written
somewhere it would leak. Do guest cart writes in the browser:

```vue
<script setup lang="ts">
const { refresh, addLine } = useCart()

// Right: runs in the browser only.
onMounted(() => refresh())
</script>
```

```vue
<script setup lang="ts">
// Wrong for a signed-out visitor: this runs during SSR.
const { addLine } = useCart()
await addLine({ variant_id, quantity: 1 })
</script>
```

Cart writes for a **signed-in** customer during SSR are fine: that cart is addressed by the session
cookie you forwarded, not by a guest token.

### Bearer tokens

There are none in this API. A native app has to behave like a browser: cookie jar,
`/sanctum/csrf-cookie`, `X-XSRF-TOKEN`.

### Guest checkout

Placing an order requires a signed-in, verified customer, during SSR as much as in the browser.

### Auth calls during SSR

`login()` and `logout()` set cookies on the API's response to your **server**, not on the response
your server sends to the browser. The browser never sees them. Sign in from the browser.

## Which composables are safe to run during SSR

| Composable | SSR |
| --- | --- |
| `useStoreInfo`, `useStoreSettings` | yes |
| `useProducts`, `useProduct` | yes |
| `useSlider`, `useBanners` | yes; public, so no cookie is needed |
| `useProductSearch` | invoked, not fetched; runs wherever you call it |
| `useCart` reads | yes, with a session cookie or a supplied guest token |
| `useCart` writes | signed-in only |
| `useCustomerAuth` | no; call from the browser |
| `useCustomerProfile`, `useAddresses` | yes, with a forwarded cookie |
| `useOrders`, `useReturns`, `useFulfillment` | yes, with a forwarded cookie |
| `useCheckout` | browser only in practice |

Checkout during SSR is not blocked, but it is a poor fit: it is a button press whose retry semantics
depend on holding an idempotency pair across attempts, and a render a framework may retry is the
wrong thing to attach that to.

## Turning SSR off for one call

```ts
const { data } = await useOrders(query, { server: false })
```

Useful for authenticated data on a page that is otherwise cacheable, and for anything you would
rather not pay for during the render.

```ts
const { data } = await useProducts(query, { lazy: true })
```

`lazy` keeps the fetch on the server but stops it blocking navigation.

## A `401` during SSR

Usually the cookie was not forwarded, not that the shopper is signed out. Check the outgoing request
actually carries `cookie` before sending anyone to a login page. See
[Authentication → development setup](/guide/authentication#development-setup) for the two settings
that cause this.
