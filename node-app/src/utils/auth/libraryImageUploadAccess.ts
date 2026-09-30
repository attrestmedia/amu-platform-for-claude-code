type LibraryImageUploadUserLike = {
  roles?: unknown;
  subscription?: {
    active?: unknown;
    currentPeriodEnd?: unknown;
  };
  wallet?: {
    membership?: {
      expiresAt?: unknown;
    };
  };
};

function toFutureTimestamp(value: unknown, now: number) {
  if (!value) return 0;
  const timestamp = new Date(value as string | number | Date).getTime();
  return Number.isFinite(timestamp) && timestamp > now ? timestamp : 0;
}

export function hasLibraryImageUploadAccess(user: LibraryImageUploadUserLike | null | undefined, now = Date.now()) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes("administrator")) return true;

  const subscriptionUntil =
    user?.subscription?.active === true ? toFutureTimestamp(user.subscription.currentPeriodEnd, now) : 0;
  const membershipUntil = toFutureTimestamp(user?.wallet?.membership?.expiresAt, now);
  return Math.max(subscriptionUntil, membershipUntil) > now;
}
