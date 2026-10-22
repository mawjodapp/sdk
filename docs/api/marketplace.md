# `marketplace`

Calls that exist only when the deployment runs as a marketplace. A single shop answers every one
with `404 not_found`, so read the store's mode before you link to them.

```ts
mawjod.marketplace.vendorSignup.sendCode(input)
mawjod.marketplace.vendorSignup.apply(input)
mawjod.marketplace.vendorSignup.areas(query)
```

## When to offer "sell with us"

Both conditions, read once:

```ts
import { MarketplaceSettingKey, StoreMode, VendorRegistration } from '@mawjod/api'

const store = await mawjod.store.get()
const { settings } = await mawjod.store.settings()

const sellPage = store.mode === StoreMode.Marketplace
  && settings[MarketplaceSettingKey.VendorRegistration]?.value === VendorRegistration.Open

// false in a single shop (the setting does not exist there) and while registration is closed;
// both signup calls would answer 403 vendor_registration_closed in the second case
```

## The flow

```
vendorSignup.sendCode()   email → a six-digit code by email; always 202 while open
vendorSignup.apply()      email + code + the business's details → a pending vendor
```

The code proves the applicant reads that inbox. It lives ten minutes and dies after five wrong
tries. `sendCode()` answers the same whether or not the address already has an account, so it
can't be used to learn who does; `apply()` is where a taken address is refused.

After `apply()` the vendor is `pending` until someone on the marketplace team decides. If the
marketplace approves applications on its own, it comes back `approved` at once. Either way the
owner gets an email with a link to set a password once approved. Nobody can sign in before that.

## `vendorSignup.sendCode()`

```ts
sendCode(input: VendorSignupCodeInput): Promise<void>
```

`POST /api/v1/marketplace/vendor-signup/code`. Five a minute per address.

```ts
interface VendorSignupCodeInput {
  email: string
}
```

## `vendorSignup.apply()`

```ts
apply(input: VendorSignupInput): Promise<VendorApplication>
```

`POST /api/v1/marketplace/vendor-signup`. Ten a minute per address.

```ts
interface VendorSignupInput {
  email: string
  code: string                    // the six digits from the email
  owner_name: string              // the person who will own the account, up to 160
  name_ar: string                 // the business's name, up to 160 each
  name_en: string                 // the vendor's web address word is made from this one
  about_ar?: string | null        // optional, up to 2000 each
  about_en?: string | null
  contact_email: string
  contact_phone: string           // E.164, e.g. +201000000002
  area_id: string                 // from vendorSignup.areas()
  address_line: string            // street and building, up to 200
  legal_name: string              // the registered company name, up to 200
  commercial_register_no: string  // up to 60
  tax_registration_no: string     // up to 60
}

interface VendorApplication {
  id: string
  status: VendorStatus   // 'pending', or 'approved' when the marketplace approves on its own
}
```

## `vendorSignup.areas()`

```ts
areas(query?: AreasQuery): Promise<Paginated<AdministrativeArea>>
```

`GET /api/v1/marketplace/vendor-signup/areas`. The same areas and the same query as
[`customer.areas.list()`](/api/customer), open to anyone, so the form can offer a governorate and
then its cities. `page.size` is at most 100.

## Constants

```ts
import { MarketplaceSettingKey, VendorRegistration, VendorStatus } from '@mawjod/api'

VendorStatus.Pending        // 'pending'   waiting for a decision
VendorStatus.Approved       // 'approved'  selling
VendorStatus.Rejected       // 'rejected'  turned down; stays so until the team reopens it
VendorStatus.Suspended      // 'suspended' paused; its staff can look but not change anything

VendorRegistration.Open     // 'open'
VendorRegistration.Closed   // 'closed'

MarketplaceSettingKey.VendorRegistration   // 'marketplace.vendor_registration'
```

## Refusals

| Code | Status | What happened | What the page says |
| --- | --- | --- | --- |
| `vendor_registration_closed` | 403 | The marketplace isn't taking applications. | "We're not taking new sellers right now." |
| `vendor_signup_code_invalid` | 422 | The code is wrong, expired, or used up after five wrong tries. | "That code didn't work. Ask for a new one." |
| `vendor_email_unavailable` | 409 | The address already has an account here. | "This email already has an account. Use another one." |

`vendor_signup_code_invalid` covers all three causes on purpose; offer "send a new code" rather than
telling them apart. `validation_failed`, `rate_limited` and `store_unavailable` apply as everywhere
else.

## In Nuxt

```ts
const { email, application, pending, error, sendCode, apply, reset } = useVendorSignup()
```

`sendCode()` sets `email`, `apply()` sets `application`, and `reset()` goes back to the first step.
See [Composables → useVendorSignup](/nuxt/composables#usevendorsignup).
