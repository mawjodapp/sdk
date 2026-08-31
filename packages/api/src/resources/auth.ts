import type { Transport } from '../http.js'
import type {
  AcceptedStatus,
  AuthSession,
  Customer,
  PasswordResetStatus,
  SignedOutStatus,
} from '../types.js'

/**
 * Identity is an email or an E.164 phone, whichever the store's identity mode uses. Send the one
 * the store expects; sending the other is a 422.
 */
export interface RegisterInput {
  name: string
  email?: string
  phone?: string
  /** At least 8 characters, letters and numbers. */
  password: string
  password_confirmation: string
}

export interface LoginInput {
  identity: string
  password: string
}

export interface VerifyInput {
  identity: string
  /** Exactly six digits. */
  code: string
}

export interface ResetPasswordInput {
  identity: string
  code: string
  password: string
  password_confirmation: string
}

export interface AuthNamespace {
  /** Registers and triggers a verification challenge. */
  register(input: RegisterInput): Promise<Customer>
  /**
   * Signs in. Identity rides the session cookie afterwards; there is no token to store.
   *
   * Wrong password, unknown account and unverified account all answer identically on purpose. Do
   * not try to tell a caller which one it was.
   */
  login(input: LoginInput): Promise<AuthSession>
  verify(input: VerifyInput): Promise<Customer>
  /** Answers 202 whether or not an eligible account exists. */
  resendVerification(identity: string): Promise<AcceptedStatus>
  /** Answers 202 whether or not the account exists. */
  forgotPassword(identity: string): Promise<AcceptedStatus>
  resetPassword(input: ResetPasswordInput): Promise<PasswordResetStatus>
  /** Signs out and forgets any stored guest cart token. */
  logout(): Promise<SignedOutStatus>
}

export function createAuthNamespace(transport: Transport): AuthNamespace {
  return {
    register: (input) =>
      transport.data<Customer>({ method: 'POST', path: '/customer/auth/register', body: input }),

    login: (input) =>
      transport.data<AuthSession>({ method: 'POST', path: '/customer/auth/login', body: input }),

    verify: (input) =>
      transport.data<Customer>({ method: 'POST', path: '/customer/auth/verify', body: input }),

    resendVerification: (identity) =>
      transport.data<AcceptedStatus>({
        method: 'POST',
        path: '/customer/auth/verification/resend',
        body: { identity },
      }),

    forgotPassword: (identity) =>
      transport.data<AcceptedStatus>({
        method: 'POST',
        path: '/customer/auth/password/forgot',
        body: { identity },
      }),

    resetPassword: (input) =>
      transport.data<PasswordResetStatus>({
        method: 'POST',
        path: '/customer/auth/password/reset',
        body: input,
      }),

    logout: async () => {
      const result = await transport.data<SignedOutStatus>({
        method: 'POST',
        path: '/customer/auth/logout',
      })

      // The session that owned the cart is gone. Keeping the token would attach the next guest
      // session to the previous customer's abandoned cart.
      await transport.clearCartToken()

      return result
    },
  }
}
