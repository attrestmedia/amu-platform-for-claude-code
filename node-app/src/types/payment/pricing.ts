export type BillingKeyType = keyof typeof import("consts/ai/generated/modelCatalog.generated").AI_SELL_TOKENS_PER_COIN;
export type BillingCostKeyType = keyof typeof import("consts/ai/generated/modelCatalog.generated").AI_SELL_FIXED_COSTS;

export type BillingKeyLikeType = BillingKeyType | (string & {});
export type BillingCostKeyLikeType = BillingCostKeyType | (string & {});
