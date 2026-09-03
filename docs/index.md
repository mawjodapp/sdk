---
layout: home

hero:
  name: Mawjod SDK
  text: Storefront clients for theme developers
  tagline: A zero-dependency TypeScript client for the Mawjod storefront API, and a Nuxt 4 module that wires it into an app for you.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: Building a theme
      link: /guide/building-a-theme
    - theme: alt
      text: API reference
      link: /api/store

features:
  - title: '@mawjod/api'
    details: One client object with a namespace per resource. Native fetch, no runtime dependencies, session cookies and CSRF handled for you.
  - title: '@mawjod/nuxt'
    details: A Nuxt 4 module with auto-imported composables, one client per request, cookie forwarding during SSR, and a shared cart.
  - title: Honest about the contract
    details: Money is minor units. Errors carry a machine-readable code. Guest carts are addressed by a token you only see once. All of it is documented here.
---

## Install

```sh
# The client on its own, for any TypeScript project
pnpm add @mawjod/api
```

```sh
# The Nuxt module, which brings the client with it
pnpm add @mawjod/nuxt
```

## What this documents

Mawjod is a single-store commerce backend. One deployment serves exactly one store: there is no
tenant header, no store selector, and nothing in a request can point at a different store.

These two packages cover the storefront surface, the endpoints a theme calls on behalf of a
shopper. Staff and admin endpoints are out of scope.

Start with [Getting started](/guide/getting-started) for the first call, then
[Building a theme](/guide/building-a-theme) for a working storefront end to end.

## What release one does not have

So you do not build a page around something that is not there:

- No guest checkout. A shopper can fill a cart as a guest, but placing an order requires a
  signed-in customer. Whether that customer also has to be verified is a store setting, off by
  default.
- No bearer tokens. Identity is a Laravel Sanctum session cookie. There is no token to store, and
  no native-app auth path yet.
- No wishlists, reviews, or related products. No endpoint serves them.
