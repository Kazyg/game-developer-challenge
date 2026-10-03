export interface RegistrationRetryPolicy { readonly delaysMs: readonly number[] }
export const REGISTRATION_RETRY: RegistrationRetryPolicy = {
  delaysMs: [10_000, 30_000, 60_000, 600_000, 1_800_000],
}
