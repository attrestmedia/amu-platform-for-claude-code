export function allocateUserBonusChargedDebit(bonusCoinsRaw: number, chargedCoinsRaw: number, needCoinsRaw: number) {
  const bonusCoins = Math.max(0, Number(bonusCoinsRaw || 0));
  const chargedCoins = Math.max(0, Number(chargedCoinsRaw || 0));
  const needCoins = Math.max(0, Number(needCoinsRaw || 0));
  const useBonusCoins = Math.min(needCoins, bonusCoins);
  const useChargedCoins = Math.min(needCoins - useBonusCoins, chargedCoins);
  return {
    ok: useBonusCoins + useChargedCoins >= needCoins,
    useBonusCoins,
    useChargedCoins,
  };
}

export function allocateUserWalletRefund(
  coinsRaw: number,
  original?: { bonusCoins?: number; membershipCoins?: number; chargedCoins?: number } | null,
) {
  let remaining = Math.max(0, Number(coinsRaw || 0));
  if (!original) return { bonusCoins: 0, membershipCoins: 0, chargedCoins: remaining };

  const bonusCoins = Math.min(remaining, Math.max(0, Number(original.bonusCoins || 0)));
  remaining -= bonusCoins;
  const membershipCoins = Math.min(remaining, Math.max(0, Number(original.membershipCoins || 0)));
  remaining -= membershipCoins;
  const chargedCoins = Math.min(remaining, Math.max(0, Number(original.chargedCoins || 0)));
  return { bonusCoins, membershipCoins, chargedCoins };
}
