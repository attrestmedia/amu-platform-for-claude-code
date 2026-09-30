export type BillingKeyType = keyof typeof import("consts/payment").TOKENS_PER_COIN;
export type BillingCostKeyType = keyof typeof import("consts/payment").FIXED_COSTS;

export type BillingKeyLikeType = BillingKeyType | (string & {});
export type BillingCostKeyLikeType = BillingCostKeyType | (string & {});
