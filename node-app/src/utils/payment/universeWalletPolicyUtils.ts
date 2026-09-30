import { UNIVERSE_INACTIVITY_CLOSE_MONTHS, UNIVERSE_RENEWAL_LEAD_DAYS } from "consts/payment";
import type { WalletType } from "types/payment";
import { computeUniverseAnniversaryPeriod } from "./billingUtils";

export const UNIVERSE_WALLET_SUSPENDED_MESSAGE = "멤버십 부족으로 유니버스가 잠시 사라집니다.";

const asDate = (value: Date | string | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export function addMonthsClamped(value: Date, months: number) {
  const result = new Date(value);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export function resolveUniverseWalletPolicyState(wallet?: WalletType, now = new Date()) {
  const expiresAt = asDate(wallet?.membership?.expiresAt);
  const renewableAt =
    asDate(wallet?.membership?.renewableAt) ||
    (expiresAt ? new Date(expiresAt.getTime() - UNIVERSE_RENEWAL_LEAD_DAYS * 86_400_000) : undefined);
  const rawMembershipCoins = Math.max(0, Number(wallet?.membership?.coins || 0));
  const membershipCoins = expiresAt && expiresAt.getTime() <= now.getTime() ? 0 : rawMembershipCoins;
  const chargedCoins = Math.max(0, Number(wallet?.charged?.coins || 0));
  const lastActivityAt = asDate(wallet?.lastQualifyingActivityAt);
  const inactivityClosesAt = lastActivityAt ? addMonthsClamped(lastActivityAt, UNIVERSE_INACTIVITY_CLOSE_MONTHS) : undefined;
  const closed = Boolean(wallet?.closedAt) || Boolean(inactivityClosesAt && inactivityClosesAt <= now);
  const totalCoins = membershipCoins + chargedCoins;
  const pendingRenewal = wallet?.membership?.pendingRenewal;
  const renewalMode =
    !closed && !pendingRenewal && membershipCoins > 0 && expiresAt && expiresAt > now
      ? renewableAt && renewableAt <= now
        ? "scheduled"
        : undefined
      : !closed && !pendingRenewal
        ? "immediate"
        : undefined;

  return {
    accessState: closed ? ("closed" as const) : totalCoins > 0 ? ("active" as const) : ("suspended" as const),
    publicAllowed: !closed && totalCoins > 0,
    chargeAllowed: !closed && membershipCoins > 0 && Boolean(expiresAt && expiresAt > now),
    renewalAllowed: Boolean(renewalMode),
    renewalMode,
    membershipCoins,
    chargedCoins,
    totalCoins,
    expiresAt,
    renewableAt,
    pendingRenewal,
    inactivityClosesAt,
    closeReason: closed ? ("inactive" as const) : totalCoins <= 0 ? ("coins_empty" as const) : undefined,
    message: !closed && totalCoins > 0 ? undefined : UNIVERSE_WALLET_SUSPENDED_MESSAGE,
  };
}

export function resolveUniverseRenewalPeriod(wallet: WalletType | undefined, now = new Date()) {
  const state = resolveUniverseWalletPolicyState(wallet, now);
  if (!state.renewalMode) return undefined;
  const startsAt = state.renewalMode === "scheduled" && state.expiresAt ? state.expiresAt : now;
  return {
    ...computeUniverseAnniversaryPeriod(startsAt),
    mode: state.renewalMode as "immediate" | "scheduled",
  };
}
