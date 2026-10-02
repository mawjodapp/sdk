# `auth`

Customer registration, verification, sign-in by password or by code, and password recovery. Identity is a Laravel Sanctum
session cookie, and there are no bearer tokens in this API.

See [Authentication](/guide/authentication) for the session and CSRF model, and for the two
deployment settings that break local development.

```ts
mawjod.auth.register(input)
mawjod.auth.verify(input)
mawjod.auth.resendVerification(identity)
mawjod.auth.login(input)
mawjod.auth.requestSignInCode(identity)
mawjod.auth.loginWithCode(input)
mawjod.auth.forgotPassword(identity)
mawjod.auth.resetPassword(input)
mawjod.auth.logout()
```

## `auth.register()`

```ts
register(input: RegisterInput): Promise<Customer>
```

`POST /api/v1/customer/auth/register`.

```ts
interface RegisterInput {
  name: string                    // up to 120 characters
  email?: string                  // up to 254; an email address
  phone?: string                  // E.164
  password: string                // at least 8 characters, letters and numbers
  password_confirmation: string   // must match
}
```

Send `email` or `phone`, whichever the store's identity mode uses. Sending the other one is a
`422`.

Registering triggers a verification challenge through whatever channel the store has configured.
Whether that challenge gates anything is the store's decision, through
`auth.customer_verification_required`, which is off by default. See
[`store.settings()` → Verification](/api/store#verification).

::: warning No session is created
`register()` does not sign anyone in, and neither does `verify()`. Only `login()` and
`loginWithCode()` do. Route a
freshly registered shopper to the login page, or to a verification screen when the store requires
verification, but not to an account page.
:::

Returns a `Customer` with `identity.verified_at: null`. That stays `null` until the identity is
verified, and on a store that does not require verification it stays `null` for good without
blocking anything.

## `auth.verify()`

```ts
verify(input: VerifyInput): Promise<Customer>
```

`POST /api/v1/customer/auth/verify`. Offer this screen when the store asks for it; on a default
store nothing depends on it.

```ts
interface VerifyInput {
  identity: string   // up to 254 characters
  code: string       // exactly six digits
}
```

Returns the `Customer` with `identity.verified_at` set. Still no session, so send them to log in.

A wrong or expired code is `422 invalid_identity_challenge`.

## `auth.resendVerification()`

```ts
resendVerification(identity: string): Promise<AcceptedStatus>
```

`POST /api/v1/customer/auth/verification/resend`. Answers `202 { status: 'accepted' }` whether or not
an eligible account exists, so it cannot be used to probe for registered identities. Show the same
confirmation either way.

## `auth.login()`

```ts
login(input: LoginInput): Promise<AuthSession>
```

`POST /api/v1/customer/auth/login`.

```ts
interface LoginInput {
  identity: string   // up to 254 characters
  password: string   // up to 255
}

interface AuthSession {
  auth_type: string  // 'session'
  customer: Customer
}
```

There is no token in the response. From here the session cookie carries identity.

Wrong password and unknown account both answer `401 unauthenticated`, identically and on purpose,
and so does an unverified account on a store that requires verification. Do not try to tell the
shopper which one it was.

After a successful login, merge any guest cart. See [`cart.merge`](/api/cart#cart-merge).

## Sign-in by code

A store can let customers sign in with a six-digit code sent to their email or phone, instead of a
password. The switch is the public setting `auth.otp_signin_enabled`, off by default. Read it before
you show a "send me a code" button:

```ts
const { settings } = await mawjod.store.settings()
const offersCode = settings['auth.otp_signin_enabled']?.value === true
```

While it is off, both calls below answer `403 otp_signin_disabled` whatever the body.

An account that a guest checkout created has no password. It signs in by code, or sets a password
through [`forgotPassword`](#auth-forgotpassword).

### `auth.requestSignInCode()`

```ts
requestSignInCode(identity: string): Promise<AcceptedStatus>
```

`POST /api/v1/customer/auth/otp/request`. Answers `202 { status: 'accepted' }`, after the same wait,
whether or not the account exists. Show the same "check your inbox" screen either way, and never
say "no account with that email".

When the account exists, a code valid once for ten minutes goes to the identity, and any earlier
code stops working.

### `auth.loginWithCode()`

```ts
loginWithCode(input: LoginWithCodeInput): Promise<AuthSession>
```

`POST /api/v1/customer/auth/otp/verify`.

```ts
interface LoginWithCodeInput {
  identity: string   // up to 254 characters
  code: string       // exactly six digits
}
```

The result is the same session and the same `AuthSession` a password login gives, so merge the
guest cart afterwards exactly as you would after `login()`. A wrong, spent, expired or never-sent
code and a missing account all answer `422 invalid_identity_challenge`. Five wrong tries burn the
code; ask for a new one.

```ts
session.customer // { id: '01916f7a-…', name: 'Mona Ali', identity: { type: 'email', value: 'mona@example.test', verified_at: '2026-08-14T17:00:00+00:00' } }
session.customer // { id: '01916f7a-…', name: '', identity: { type: 'email', value: 'nour@example.test', verified_at: null } }
```

The second is an account a guest checkout created without a name. Fall back to the identity when
`name` is empty.

## `auth.forgotPassword()`

```ts
forgotPassword(identity: string): Promise<AcceptedStatus>
```

`POST /api/v1/customer/auth/password/forgot`. Answers `202 { status: 'accepted' }` regardless of
whether the account exists.

## `auth.resetPassword()`

```ts
resetPassword(input: ResetPasswordInput): Promise<PasswordResetStatus>
```

`POST /api/v1/customer/auth/password/reset`.

```ts
interface ResetPasswordInput {
  identity: string
  code: string                    // six digits
  password: string
  password_confirmation: string
}
```

Returns `{ status: 'password_reset' }`. A bad code is `422 invalid_identity_challenge`.

## `auth.logout()`

```ts
logout(): Promise<SignedOutStatus>
```

`POST /api/v1/customer/auth/logout`. Requires an authenticated customer. Returns
`{ status: 'signed_out' }`.

The client clears any stored guest cart token as part of this. Keeping it would attach the next
guest session to the previous customer's abandoned cart.

## `Customer`

```ts
interface Customer {
  id: string
  name: string
  identity: {
    type: 'email' | 'phone'
    value: string              // normalized: lowercased email, or E.164 phone
    verified_at: string | null
  }
}
```

## Errors

| Code | Status | Where |
| --- | --- | --- |
| `identity_unavailable` | 422 | `register` |
| `invalid_identity_challenge` | 422 | `verify`, `resetPassword`, `loginWithCode` |
| `otp_signin_disabled` | 403 | `requestSignInCode`, `loginWithCode`, while `auth.otp_signin_enabled` is off |
| `unauthenticated` | 401 | `login` (bad credentials), `logout` |
| `validation_failed` | 422 | everywhere |
| `rate_limited` | 429 | everywhere |
| `store_unavailable` | 503 | everywhere |

## In Nuxt

```ts
const { customer, isAuthenticated, login, requestSignInCode, loginWithCode, logout, mergeError } =
  useCustomerAuth()
```

`useCustomerAuth()` keeps a shared `customer` ref and merges the guest cart after login by default,
by password or by code.
It deliberately does not populate `customer` on `register()` or `verify()`, because neither creates
a session. See [Composables → useCustomerAuth](/nuxt/composables#usecustomerauth).
