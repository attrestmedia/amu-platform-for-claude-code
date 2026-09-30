export const EMAIL_VERIFICATION_METHODS = [
  "email_link",
  "google",
  "apple",
  "password_reset",
  "admin",
] as const;

export type EmailVerificationMethod = (typeof EMAIL_VERIFICATION_METHODS)[number];
