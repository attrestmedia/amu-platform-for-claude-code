export const SIGNUP_BONUS_CAMPAIGN = Object.freeze({
  campaignId: "signup-bonus-2026-08",
  coinsPerGrant: 500,
  maxRecipients: 2_000,
});

export function parseSignupBonusCampaignStart(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

export function isSignupBonusRegistrationEligible(args: {
  signupCompletedAt?: Date | string | null;
  campaignStartedAt?: Date | null;
}) {
  const registeredAt = args.signupCompletedAt ? new Date(args.signupCompletedAt) : null;
  if (!registeredAt || !Number.isFinite(registeredAt.getTime()) || !args.campaignStartedAt) return false;
  return registeredAt.getTime() >= args.campaignStartedAt.getTime();
}
