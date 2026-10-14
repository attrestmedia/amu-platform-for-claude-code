import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";
import type { AiCostTraceProviderCost } from "types/ai";
import { AI_PROVIDER_FIXED_RATES, AI_PROVIDER_TOKEN_RATES } from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";


type TokenRate = {
  input?: number;
  output?: number;
  audioInput?: number;
  audioOutput?: number;
  imageInput?: number;
  imageOutput?: number;
  videoInput?: number;
  videoOutput?: number;
  verifiedAt: string;
  sourceUrl: string;
};
type FixedRate = {
  perImage?: number;
  perVideo?: number;
  perSecond?: number;
  perMinute?: number;
  perThousandCharacters?: number;
  verifiedAt: string;
  sourceUrl: string;
};

type FixedRateField = "perImage" | "perVideo" | "perMinute" | "perThousandCharacters" | "perSecond";

const RATE_REVISION = "MB-20260928-qwen-openai-ACTIVATE-D1-R1.revision-B";

// 이 표는 사용자 코인 단가가 아니라 승인된 provider COGS 관측값이다.
// tracker 수집이 불완전한 provider의 삭제·가격 제거는 자동 반영하지 않으며, 없는 값은 unavailable로 남긴다.
export type ProviderCostCanonicalShape = [
  AssertAssignable<typeof AI_PROVIDER_TOKEN_RATES, Record<string, TokenRate>>,
  AssertAssignable<typeof AI_PROVIDER_FIXED_RATES, Record<string, FixedRate>>,
];

function rateKey(provider: string, modelName: string, variant?: string) {
  const base = `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}`;
  return variant && (
    (AI_PROVIDER_TOKEN_RATES as Record<string, TokenRate>)[`${base}:${variant}`] ||
    (AI_PROVIDER_FIXED_RATES as Record<string, FixedRate>)[`${base}:${variant}`]
  ) ? `${base}:${variant}` : base;
}

type TokenAxis = {
  usage: number;
  rateField: keyof TokenRate;
};

function unavailable(): AiCostTraceProviderCost {
  return { amount: null, currency: "USD", source: "unavailable", rateRevision: RATE_REVISION };
}

function isValidQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function getFixedCost(
  usage: IFixedUsage,
  rate: FixedRate | undefined,
): { amount: number; verifiedAt?: string } | null {
  if (!rate) return null;

  const images = Number(usage.images ?? 0);
  const videos = Number(usage.videos ?? 0);
  const seconds = Number(usage.seconds ?? 0);
  const hasMinutes = usage.minutes !== undefined && usage.minutes !== null;
  const minutes = hasMinutes ? Number(usage.minutes) : seconds / 60;
  const characters = Number(usage.characters ?? 0);
  const texts = Number(usage.texts ?? 0);
  const credits = Number(usage.credits ?? 0);
  const fixedQuantities = [images, videos, seconds, minutes, characters, texts, credits];
  if (fixedQuantities.some((quantity) => !isValidQuantity(quantity))) return null;
  if (texts > 0 || credits > 0) return null;

  const fixedBases: Array<{ quantity: number; rateField: FixedRateField }> = [
    { quantity: images, rateField: "perImage" },
    { quantity: videos, rateField: "perVideo" },
    { quantity: minutes, rateField: "perMinute" },
    { quantity: characters / 1_000, rateField: "perThousandCharacters" },
    { quantity: seconds, rateField: "perSecond" },
  ];
  if (!fixedQuantities.some((quantity) => quantity > 0)) return { amount: 0, verifiedAt: rate.verifiedAt };

  for (const { quantity, rateField } of fixedBases) {
    if (quantity === 0 && !(rateField === "perMinute" && hasMinutes)) continue;
    const unitRate = rate[rateField];
    if (unitRate === undefined) continue;
    if (typeof unitRate !== "number" || !Number.isFinite(unitRate) || unitRate < 0) return null;
    const amount = quantity * unitRate;
    if (!Number.isFinite(amount) || amount < 0) return null;
    return { amount, verifiedAt: rate.verifiedAt };
  }
  return null;
}

export function calculateProviderCogs(args: {
  provider: string;
  modelName: string;
  variant?: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}): AiCostTraceProviderCost {
  const key = rateKey(args.provider, args.modelName, args.variant);
  const tokenRate = (AI_PROVIDER_TOKEN_RATES as Record<string, TokenRate>)[key];
  const fixedRate = (AI_PROVIDER_FIXED_RATES as Record<string, FixedRate>)[key];
  const usage = args.usage;
  const tokenAxes: TokenAxis[] = [
    { usage: Number(usage?.text?.input ?? 0), rateField: "input" },
    { usage: Number(usage?.text?.output ?? 0), rateField: "output" },
    { usage: Number(usage?.audio?.input ?? 0), rateField: "audioInput" },
    { usage: Number(usage?.audio?.output ?? 0), rateField: "audioOutput" },
    { usage: Number(usage?.image?.input ?? 0), rateField: "imageInput" },
    { usage: Number(usage?.image?.output ?? 0), rateField: "imageOutput" },
    { usage: Number(usage?.video?.input ?? 0), rateField: "videoInput" },
    { usage: Number(usage?.video?.output ?? 0), rateField: "videoOutput" },
  ];
  const fixedUsage = args.fixed ?? {};
  const fixedQuantities = [fixedUsage.seconds, fixedUsage.minutes, fixedUsage.images, fixedUsage.videos, fixedUsage.texts, fixedUsage.characters, fixedUsage.credits]
    .map((quantity) => Number(quantity ?? 0));
  if (tokenAxes.some(({ usage: quantity }) => !isValidQuantity(quantity)) || fixedQuantities.some((quantity) => !isValidQuantity(quantity))) {
    return unavailable();
  }

  const positiveTokenAxes = tokenAxes.filter(({ usage: quantity }) => quantity > 0);
  const positiveFixedUsage = fixedQuantities.some((quantity) => quantity > 0);
  if (positiveTokenAxes.length > 0 && tokenRate) {
    let tokenAmount = 0;
    for (const { usage: quantity, rateField } of positiveTokenAxes) {
      const unitRate = tokenRate[rateField];
      if (typeof unitRate !== "number" || !Number.isFinite(unitRate) || unitRate < 0) return unavailable();
      tokenAmount += quantity * unitRate / 1_000_000;
    }
    if (!Number.isFinite(tokenAmount) || tokenAmount < 0) return unavailable();
    return {
      amount: tokenAmount,
      currency: "USD",
      source: "catalog",
      rateRevision: RATE_REVISION,
      verifiedAt: tokenRate.verifiedAt,
    };
  }

  if (positiveFixedUsage) {
    const fixedCost = getFixedCost(fixedUsage, fixedRate);
    if (!fixedCost) return unavailable();
    return {
      amount: fixedCost.amount,
      currency: "USD",
      source: "catalog",
      rateRevision: RATE_REVISION,
      ...(fixedCost.verifiedAt ? { verifiedAt: fixedCost.verifiedAt } : {}),
    };
  }

  if (positiveTokenAxes.length > 0) return unavailable();
  if (!tokenRate && !fixedRate) return unavailable();
  if (tokenRate) {
    return {
      amount: 0,
      currency: "USD",
      source: "catalog",
      rateRevision: RATE_REVISION,
      verifiedAt: tokenRate.verifiedAt,
    };
  }
  const zeroFixedCost = getFixedCost(fixedUsage, fixedRate);
  if (!zeroFixedCost) return unavailable();
  return {
    amount: zeroFixedCost.amount,
    currency: "USD",
    source: "catalog",
    rateRevision: RATE_REVISION,
    ...(zeroFixedCost.verifiedAt ? { verifiedAt: zeroFixedCost.verifiedAt } : {}),
  };
}
