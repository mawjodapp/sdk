# Authentication

Mawjod uses Laravel Sanctum session-cookie authentication. There is no bearer token anywhere in the
storefront surface, and `intro.md` on the backend says a mobile token scheme is not part of this
release. If you are looking for a place to store an access token, there isn't one.

## The model

Three things carry identity, and the client manages all three:

1. A session cookie, named by the deployment's `SESSION_COOKIE` (`mawjod-session` by default). It
   is set by `GET /sanctum/csrf-cookie` and starts carrying customer identity once
   `POST /customer/auth/login` succeeds.
2. An `XSRF-TOKEN` cookie, set by the same call. It is stored URL-encoded.
3. An `X-XSRF-TOKEN` request header, which must be the *decoded* value of that cookie. Sanctum
   answers `419` if it is missing or stale.

Every request the client sends uses `credentials: 'include'`, so the browser attaches both cookies.

### What the client does for you

- Before the first `POST`, `PUT`, `PATCH` or `DELETE`, it calls `/sanctum/csrf-cookie` once. If a
  readable token is already there, it skips the round trip.
- It reads `XSRF-TOKEN`, decodes it, and sends `X-XSRF-TOKEN` on every unsafe request.
- On a `419` response to an unsafe request it refreshes the token once and replays the request
  once. A second `419` is a real failure, not a race.
- Reads never trigger any of this. A guest can browse the catalog and read a cart with no CSRF
  bootstrap at all.

`/sanctum/csrf-cookie` sits outside `/api/v1`. It does not speak problem+json and carries no `code`
or `request_id`, so the client treats any non-`204` there as a transport failure and throws
`MawjodNetworkError`. When you see one, retry the CSRF call, not the write that triggered it.

## Register

```ts
const customer = await mawjod.auth.register({
  name: 'Nour Adel',
  email: 'nour@example.com',
  password: 'correct horse 42',
  password_confirmation: 'correct horse 42',
})

console.log(customer.identity) // { type: 'email', value: 'nour@example.com', verified_at: null }
```

Identity is either an email or an E.164 phone, whichever the store's identity mode uses. Send the
one the store expects; sending the other is a `422`. The password needs at least eight characters
with letters and numbers.

Registering triggers a verification challenge over whichever channel the store has configured.
Whether anything depends on that challenge is the store's decision; see
[Verification](#verification).

::: warning
`register()` does not create a session. Neither does `verify()`. Only `login()` does. A theme that
routes a freshly registered shopper straight to a page that reads `customer.profile` will get a
`401`.
:::

## Verification

Verification is a store setting, `auth.customer_verification_required`, and it is off by default.
Read it from `store.settings()` and let it decide whether the theme surfaces any verification UX at
all:

```ts
const { settings } = await mawjod.store.settings()
const requiresVerification = settings['auth.customer_verification_required']?.value === true
```

Treat a missing key as off.

While it is off, an unverified customer signs in, places orders and resets a password like anyone
else. `identity.verified_at: null` is a normal state on a live session, not a half-finished
registration, so do not gate an account page or a checkout button on it.

When a store turns it on, `checkout.place()` answers `403 customer_not_verified` until the identity
is verified, and login stops distinguishing an unverified account from a wrong password.

::: info How this used to work
Verification used to be mandatory for every store, and codes were recorded but never delivered over
any channel, hashed at rest and readable by nobody. A new customer could not clear the check and so
could not place a first order at all. Making it a setting, off by default, is what removed that
dead end. If you are reading a theme written against the old behaviour, the verification screen it
routes to unconditionally is the part to make conditional.
:::

```ts
await mawjod.auth.verify({ identity: 'nour@example.com', code: '123456' })
```

The code is exactly six digits. A wrong or expired code is `422 invalid_identity_challenge`.

To send another one:

```ts
await mawjod.auth.resendVerification('nour@example.com')
```

That answers `202` whether or not an eligible account exists, so you cannot use it to probe whether
someone is registered. Show the same confirmation either way.

## Log in

```ts
const session = await mawjod.auth.login({
  identity: 'nour@example.com',
  password: 'correct horse 42',
})

console.log(session.auth_type) // 'session'
console.log(session.customer.name)
```

The response carries the customer, not a token. From here the session cookie is the credential.

Wrong password and unknown account answer identically, on purpose, and so does an unverified
account on a store that requires verification. Do not try to tell the shopper which one it was. You
cannot, and the server is deliberately not helping.

If the shopper filled a guest cart before logging in, merge it now. See
[Cart → merge on login](/guide/cart#merge-on-login).

## Forgotten passwords

```ts
await mawjod.auth.forgotPassword('nour@example.com')

await mawjod.auth.resetPassword({
  identity: 'nour@example.com',
  code: '123456',
  password: 'a different one 42',
  password_confirmation: 'a different one 42',
})
```

`forgotPassword` answers `202` regardless of whether the account exists. `resetPassword` answers
`422 invalid_identity_challenge` for a bad code.

## Log out

```ts
await mawjod.auth.logout()
```

The client clears any stored guest cart token as part of this. Keeping it would attach the next
guest session to the previous customer's abandoned cart.

## Checking whether someone is signed in

There is no "current session" endpoint. Read the profile and treat `401` as signed out:

```ts
import { isUnauthenticated } from '@mawjod/api'

try {
  const customer = await mawjod.customer.profile.get()
  // signed in
} catch (error) {
  if (isUnauthenticated(error)) {
    // signed out; send them to the login page
  } else {
    throw error
  }
}
```

In Nuxt, `useCustomerAuth()` keeps a shared `customer` ref for you, but it starts `null` on a fresh
page load even for a shopper whose session cookie is still valid, because nothing has asked the
server yet. Call `useCustomerProfile()` if you need to know on first render.

## Verification and checkout

On a default store nothing happens here: an unverified customer browses, holds a cart and places an
order.

On a store with `auth.customer_verification_required` on, checkout refuses with
`403 customer_not_verified`. Route that to a verification screen, not back to the cart. The cart is
fine. See [Checkout → failure families](/guide/checkout#failure-families).

Handle the code either way. A store can turn the setting on after your theme ships, and the cost of
handling a `403` that never arrives is one branch.

## Development setup

Sanctum's SPA mode only works when the browser considers your storefront and the API to be the same
site. Two settings on the deployment control that, and getting either wrong produces failures that
look like bugs in your theme.

### `SANCTUM_STATEFUL_DOMAINS`

The list of frontend origins whose requests should be treated as stateful, meaning "authenticate
this with the session cookie". Your storefront's host and port must be in it.

- Include the port. `localhost:3000` is a different entry from `localhost`. A Nuxt dev server on
  `:3000` that is not listed will get `401` on every authenticated call while the cookie is sitting
  right there in the jar.
- Pick one host and stay on it. `localhost` and `127.0.0.1` are different hosts to a browser. If
  the API is on `127.0.0.1:8000` and your theme is on `localhost:3000`, the cookie the API sets is
  scoped to `127.0.0.1` and never travels. Use `localhost` for both, or `127.0.0.1` for both.

### `CORS_ALLOWED_ORIGINS`

Cross-origin credentialed requests need the API to answer with the exact origin (a wildcard is
rejected by the browser when credentials are involved) and to allow credentials. Your storefront's
full origin (scheme, host and port) goes in this list.

Symptoms of a mismatch:

| What you see | Usual cause |
| --- | --- |
| `MawjodNetworkError` from `/sanctum/csrf-cookie` with no status | The browser blocked the response; the origin is not allowed. |
| CSRF call succeeds, but no `XSRF-TOKEN` cookie appears | Host mismatch: the cookie was set for a different host than the one your page is on. |
| Every write fails `419` after one retry | The cookie is present but not being echoed, or a proxy is stripping `X-XSRF-TOKEN`. |
| Reads work, writes get `401` | The origin is not in `SANCTUM_STATEFUL_DOMAINS`, so Sanctum never applied the session guard. |

### A local combination that works

```
API                 http://localhost:8000
Storefront          http://localhost:3000
SANCTUM_STATEFUL_DOMAINS   localhost:3000,localhost:8000
CORS_ALLOWED_ORIGINS       http://localhost:3000
```

```ts
createMawjodClient({ baseUrl: 'http://localhost:8000' })
```

These are backend environment variables. If you do not own the deployment, this is the list to hand
to whoever does.

## Server-side rendering

During SSR there is no cookie jar. The session cookie arrives on the incoming request and has to be
forwarded into the client by hand. `@mawjod/nuxt` does it for you; if you are wiring the client
yourself, see [Server-side rendering](/guide/ssr#forwarding-cookies).
