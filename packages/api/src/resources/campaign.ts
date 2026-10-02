import type { Transport } from '../http.js'
import type { WinClaim, WinEligibility } from '../types.js'

export interface WinCodeInput {
  /** The phone the customer ordered with, E.164. */
  phone: string
  /** The code that came with the product. Matched without regard to case; up to 64 characters. */
  code: string
}

export interface WinClaimInput extends WinCodeInput {
  rating: 1 | 2 | 3 | 4 | 5
  /** Up to 500 characters. */
  comment: string
}

/**
 * `/campaign/win/*`, open while `campaigns.win_enabled` is on; otherwise `403
 * win_campaign_disabled`. No session needed.
 */
export interface CampaignNamespace {
  win: {
    /** Checks a phone and code and names the product to review. Uses nothing up. */
    eligibility(input: WinCodeInput): Promise<WinEligibility>
    /**
     * Uses the code up and returns the coupon. There is no replay: a response lost after success
     * cannot be fetched again, so never retry this blindly.
     */
    claim(input: WinClaimInput): Promise<WinClaim>
  }
}

export function createCampaignNamespace(transport: Transport): CampaignNamespace {
  return {
    win: {
      eligibility: (input) =>
        transport.data<WinEligibility>({ method: 'POST', path: '/campaign/win/eligibility', body: input }),
      claim: (input) =>
        transport.data<WinClaim>({ method: 'POST', path: '/campaign/win/claim', body: input }),
    },
  }
}
