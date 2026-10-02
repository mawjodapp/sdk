# `campaign`

The win page: a buyer types the phone they ordered with and the code that came with a product,
reviews that product, and wins a single-use coupon drawn from the shop's gift pool. No sign-in is
involved.

```ts
mawjod.campaign.win.eligibility(input)
mawjod.campaign.win.claim(input)
```

The shop manages codes, the gift pool and the list of wins from its staff tools. Those routes are
staff surface and are not in this SDK.

## When it is open

The public setting `campaigns.win_enabled` is the switch, off by default. Read it before you link to
the win page:

```ts
const { settings } = await mawjod.store.settings()
const winPage = settings['campaigns.win_enabled']?.value === true

// true:  link the win page from the footer or the packaging insert's landing page
// false: leave it out; both calls would answer 403 win_campaign_disabled
```

## The flow

```
campaign.win.eligibility()   phone + code → the product to review; uses nothing up
campaign.win.claim()         phone + code + rating + comment → the coupon; uses the code up
```

Check first, so the review form can name the product, then claim. Both calls run the same checks in
the same order, so a code that passed `eligibility()` can still be refused by `claim()` if something
changed in between, such as another claim on the same code winning the race.

## `campaign.win.eligibility()`

```ts
eligibility(input: WinCodeInput): Promise<WinEligibility>
```

`POST /api/v1/campaign/win/eligibility`. Ten checks a minute per address.

```ts
interface WinCodeInput {
  phone: string   // E.164, the phone the customer ordered with
  code: string    // up to 64 characters, matched without regard to case
}

interface WinEligibility {
  product: { id: string; name_ar: string; name_en: string }
}
```

```ts
const { product } = await mawjod.campaign.win.eligibility({ phone: '+201000000001', code: '7KQ2M9XHRT' })

product // { id: '01916f7a-…', name_ar: 'زيت زيتون بكر', name_en: 'Extra virgin olive oil' }
```

Both names always come back; pick the one for the locale you render.

## `campaign.win.claim()`

```ts
claim(input: WinClaimInput): Promise<WinClaim>
```

`POST /api/v1/campaign/win/claim`. Five claims a minute per address.

```ts
interface WinClaimInput extends WinCodeInput {
  rating: 1 | 2 | 3 | 4 | 5
  comment: string   // up to 500 characters
}

interface WinClaim {
  coupon_code: string
  prize: {
    name_ar: string
    name_en: string
    type: 'percentage' | 'fixed_amount'
    value: number
  }
}
```

The claim uses the code up, keeps the review, draws a prize by weight and issues a coupon for it
that can be redeemed once, by whoever holds the code. `value` depends on `type`:

```ts
claimed.prize // { name_ar: 'خصم 15٪', name_en: '15% off', type: 'percentage', value: 1500 }   basis points: 15%
claimed.prize // { name_ar: 'خصم 50 جنيه', name_en: 'EGP 50 off', type: 'fixed_amount', value: 5000 }   minor units: EGP 50.00
```

Show the prize by its name, and use `type` and `value` only if you want to state the amount
yourself; format a `fixed_amount` with [`formatMoney`](/api/types#formatmoney).

The coupon code goes into the cart like any other, through
[`cart.applyCoupon()`](/api/cart#cart-applycoupon). Once it has been redeemed, applying it again comes back in the
quote's `rejected_discounts` with `reason: 'usage_limit_reached'`.

A refused claim changes nothing: the code stays unused and the shopper can try again once the
reason is fixed.

### A claim has no replay

Unlike checkout, a claim carries no idempotency key. If the connection drops after the server issued
the coupon, the response is gone, and nothing on the storefront surface reads it back: a second
claim with the same code answers `win_code_not_accepted`, because the code is used. The coupon still
exists, and the shop's staff can find it in their list of wins, but the shopper cannot see it again
without asking the shop.

So build the page to protect that one response:

- Disable the submit button while the claim is in flight, so a double click cannot send two.
- Warn before the shopper navigates away or closes the tab mid-claim (a `beforeunload` handler is
  enough).
- Render the coupon code as soon as the response lands, before anything else on the page reacts, and
  give the shopper a way to copy it.
- If a claim fails with a network error rather than a problem code, do not resend it. Tell the
  shopper the result is unknown and to contact the shop with their phone number.

## Refusals

Each refusal has a `code`. Branch on it, and show the shopper words like these:

| Code | Status | What happened | What the page says |
| --- | --- | --- | --- |
| `win_campaign_disabled` | 403 | The shop is not running the campaign. | "This offer isn't running right now." |
| `win_code_not_accepted` | 422 | The code does not exist, or it was already used. | "We couldn't accept this code. Check it and try again." |
| `win_phone_not_eligible` | 422 | The code is good, but no customer with an order has this phone. | "Enter the phone number you ordered with." |
| `win_daily_limit_reached` | 422 | This phone has claimed three prizes in the last 24 hours. | "You've reached today's limit. Try again tomorrow." |
| `win_pool_empty` | 409 | The shop has no prize left to draw. | "There are no prizes left right now. Keep your code and try again later." |

::: warning Keep `win_code_not_accepted` vague
One code covers both a code that never existed and one already used, deliberately. If the page told
the two apart ("this code was already used"), anyone could test guesses until one came back
"already used" and learn that it is real. Show the same message for both, and do not add hints such
as "codes are ten characters".
:::

The checks run in a fixed order: code, phone, daily limit, prize pool. A bad code is refused before
the phone is looked at, so without a real code every phone gets the same answer. A
`win_phone_not_eligible` therefore does mean the code is real; that is by design, since only someone
holding the product's code can reach it.

`validation_failed` (a malformed phone, a rating outside 1 to 5, a comment over 500 characters),
`rate_limited` and `store_unavailable` apply as everywhere else.

```ts
import { isMawjodApiError } from '@mawjod/api'

try {
  claimed = await mawjod.campaign.win.claim(input)
} catch (error) {
  if (isMawjodApiError(error) && error.code === 'win_code_not_accepted') {
    // same words for unknown and used codes
  }
}
```

## In Nuxt

```ts
const { product, claimed, pending, error, checkEligibility, claim, reset } = useWinCampaign()
```

`checkEligibility()` sets `product`, and `claim()` sets `claimed`. There is no `retry()`, for the
reason above. See [Composables → useWinCampaign](/nuxt/composables#usewincampaign).
