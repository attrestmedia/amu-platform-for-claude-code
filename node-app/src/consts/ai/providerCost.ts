import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";
import type { AiCostTraceProviderCost } from "types/ai";

type TokenRate = {
  input: number;
  output: number;
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

const RATE_REVISION = "MB-20260928-qwen-openai-ACTIVATE-D1-R1.revision-B";

// 이 표는 사용자 코인 단가가 아니라 승인된 provider COGS 관측값이다.
// tracker 수집이 불완전한 provider의 삭제·가격 제거는 자동 반영하지 않으며, 없는 값은 unavailable로 남긴다.
export const TOKEN_RATES: Record<string, TokenRate> = {
  "google:gemini-3.8-flash": { input: 0.75, output: 3.75, verifiedAt: "2026-09-27", sourceUrl: "https://ai.google.dev/gemini-api/docs/latest-model?hl=en" },
  "google:gemini-3.6-flash": { input: 1.5, output: 7.5, verifiedAt: "2026-08-04", sourceUrl: "https://ai.google.dev/gemini-api/docs/latest-model" },
  "google:gemini-3.1-pro-preview:short": { input: 2, output: 12, verifiedAt: "2026-05-31", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  "google:gemini-3.1-pro-preview:long": { input: 4, output: 18, verifiedAt: "2026-05-31", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  "google:gemini-3.5-flash-lite": { input: 0.3, output: 2.5, verifiedAt: "2026-08-04", sourceUrl: "https://ai.google.dev/gemini-api/docs/latest-model" },
  // GPT-5.6 Standard COGS use the conservative cache-write rate; base falls back to the >272K tier.
  "openai:gpt-5.6-sol": { input: 10, output: 30, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol" },
  "openai:gpt-5.6-sol:short": { input: 5, output: 20, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol" },
  "openai:gpt-5.6-sol:long": { input: 10, output: 30, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol" },
  "openai:gpt-5.6-terra": { input: 5, output: 18, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra" },
  "openai:gpt-5.6-terra:short": { input: 2.5, output: 12, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra" },
  "openai:gpt-5.6-terra:long": { input: 5, output: 18, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-terra" },
  "openai:gpt-5.6-luna": { input: 0.5, output: 1.8, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-luna" },
  "openai:gpt-5.6-luna:short": { input: 0.25, output: 1.2, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-luna" },
  "openai:gpt-5.6-luna:long": { input: 0.5, output: 1.8, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-luna" },
  // OpenAI GPT-6 Standard USD/MTok. The usage contract cannot distinguish cache writes from regular input,
  // so rates use the maximum Standard input tier (cache-write) as a conservative bound.
  // Base rates fall back to long context; callers should provide :short/:long when request size is known.
  "openai:gpt-6-astra": { input: 25, output: 75, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-astra" },
  "openai:gpt-6-astra:short": { input: 12.5, output: 50, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-astra" },
  "openai:gpt-6-astra:long": { input: 25, output: 75, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-astra" },
  "openai:gpt-6-sol": { input: 5, output: 15, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-sol" },
  "openai:gpt-6-sol:short": { input: 2.5, output: 10, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-sol" },
  "openai:gpt-6-sol:long": { input: 5, output: 15, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-sol" },
  "openai:gpt-6-luna": { input: 0.25, output: 0.75, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-luna" },
  "openai:gpt-6-luna:short": { input: 0.125, output: 0.5, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-luna" },
  "openai:gpt-6-luna:long": { input: 0.25, output: 0.75, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-6-luna" },
  "openai:gpt-audio-1.5": { input: 2.5, output: 10, audioInput: 32, audioOutput: 64, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-audio-1.5" },
  // Model Studio Singapore International. One input-token price applies across Omni modalities;
  // charge all input tokens at the non-cached rate because current usage has no cache-hit field.
  "qwen:qwen3.8-omni-flash": { input: 0.15, output: 0.47, audioInput: 0.15, imageInput: 0.15, videoInput: 0.15, verifiedAt: "2026-09-28", sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/model-pricing" },
  // Model Studio Singapore International. ASR 3.1 charges input and output tokens, unlike ASR 3.0.
  "qwen:qwen-audio-3.1-asr-flash": { input: 0.15, output: 0.47, audioInput: 0.15, verifiedAt: "2026-09-28", sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/model-pricing" },
  "claude:claude-haiku-4-5": { input: 1, output: 5, verifiedAt: "2026-05-26", sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing" },
  "claude:claude-sonnet-5": { input: 2, output: 10, verifiedAt: "2026-07-14", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing" },
  "claude:claude-opus-5-5": { input: 4, output: 20, verifiedAt: "2026-09-27", sourceUrl: "https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5" },
  "claude:claude-opus-5": { input: 5, output: 25, verifiedAt: "2026-08-09", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing" },
  "claude:claude-fable-5-1": { input: 10, output: 50, verifiedAt: "2026-09-27", sourceUrl: "https://platform.claude.com/docs/en/models/fable-5-1/overview" },
  "claude:claude-fable-5": { input: 10, output: 50, verifiedAt: "2026-07-14", sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing" },
  "deepseek:deepseek-v4-flash": { input: 0.14, output: 0.28, verifiedAt: "2026-08-09", sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing" },
  "deepseek:deepseek-v4-pro": { input: 0.435, output: 0.87, verifiedAt: "2026-08-09", sourceUrl: "https://api-docs.deepseek.com/quick_start/pricing" },
  "xai:grok-4.3": { input: 1.25, output: 2.5, verifiedAt: "2026-05-31", sourceUrl: "https://docs.x.ai/developers/models" },
  "xai:grok-4.7": { input: 4, output: 12, verifiedAt: "2026-09-29", sourceUrl: "https://docs.x.ai/developers/models/grok-4.7" },
  "xai:grok-4.7:short": { input: 2, output: 6, verifiedAt: "2026-09-29", sourceUrl: "https://docs.x.ai/developers/models/grok-4.7" },
  "xai:grok-4.7:long": { input: 4, output: 12, verifiedAt: "2026-09-29", sourceUrl: "https://docs.x.ai/developers/models/grok-4.7" },
  "xai:grok-4.6": { input: 4, output: 12, verifiedAt: "2026-09-27", sourceUrl: "https://docs.x.ai/developers/pricing" },
  "xai:grok-4.6:short": { input: 2, output: 6, verifiedAt: "2026-09-27", sourceUrl: "https://docs.x.ai/developers/pricing" },
  "xai:grok-4.6:long": { input: 4, output: 12, verifiedAt: "2026-09-27", sourceUrl: "https://docs.x.ai/developers/pricing" },
  "xai:grok-4.5": { input: 2, output: 6, verifiedAt: "2026-07-14", sourceUrl: "https://docs.x.ai/developers/models/grok-4.5" },
  "xai:grok-build-0.1": { input: 1, output: 2, verifiedAt: "2026-05-31", sourceUrl: "https://docs.x.ai/developers/models" },
  "xai:grok-4.20-0309-reasoning": { input: 1.25, output: 2.5, verifiedAt: "2026-05-31", sourceUrl: "https://docs.x.ai/developers/models" },
  "zai:glm-5.3": { input: 1.4, output: 4.4, verifiedAt: "2026-08-30", sourceUrl: "https://docs.z.ai/guides/overview/pricing" },
  "zai:glm-5.3-flash": { input: 0.15, output: 0.5, verifiedAt: "2026-08-30", sourceUrl: "https://docs.z.ai/guides/overview/pricing" },
};

export const FIXED_RATES: Record<string, FixedRate> = {
  "openai:gpt-transcribe": { perMinute: 0.0045, verifiedAt: "2026-09-28", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-transcribe" },
  // Model Studio Singapore International: text→1K output only. Reference-image input is excluded;
  // callers must pass variant="1K".
  "qwen:qwen-image-3.0-pro:1K": { perImage: 0.04, verifiedAt: "2026-09-28", sourceUrl: "https://www.alibabacloud.com/help/en/model-studio/model-pricing" },
  "google:gemini-2.5-flash-image": { perImage: 0.039, verifiedAt: "2026-03-14", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  "google:gemini-3.1-flash-image-preview:1K": { perImage: 0.067, verifiedAt: "2026-03-14", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  "google:gemini-3-pro-image-preview:1K": { perImage: 0.134, verifiedAt: "2026-03-14", sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing" },
  // gpt-image-2.5 계열은 공식 토큰 단가가 gpt-image-2와 동일하지만(text in $5 / image in $8 /
  // image out $30 per 1M) OpenAI가 장당 토큰 소모량을 공개하지 않는다("The GPT Image 2 calculator
  // does not estimate GPT Image 2.5 token consumption").
  // 2026-09-09 운영 실호출(1024x1024, quality=high, 참고 이미지 없음)에서 두 모델 모두 토큰 과금액이
  // 221코인으로 나와 고정 최소요금 150코인을 1.473배 초과했다. 아래 값은 gpt-image-2 관측값 $0.15에
  // 그 비율을 적용한 **추정**이다 — 절대 원가는 아직 미실측이다(생성 job의 usage 토큰을 노출하는
  // 조회 경로가 없다). usage 노출 경로가 생기면 실측값으로 대체한다.
  // 근거: job_9f716e7cedc04560b9f87df7f681595e(flare) / job_a5d6b3f387c34316892ab911d871388c(sunburst)
  "openai:gpt-image-2.5-flare": { perImage: 0.221, verifiedAt: "2026-09-09", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare" },
  "openai:gpt-image-2.5-sunburst": { perImage: 0.221, verifiedAt: "2026-09-09", sourceUrl: "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst" },
  "xai:grok-imagine-image": { perImage: 0.02, verifiedAt: "2026-03-14", sourceUrl: "https://docs.x.ai/developers/models" },
  "xai:grok-imagine-image-2.0": { perImage: 0.04, verifiedAt: "2026-09-27", sourceUrl: "https://docs.x.ai/developers/models/grok-imagine-image-2.0" },
  "zai:glm-image": { perImage: 0.015, verifiedAt: "2026-08-30", sourceUrl: "https://docs.z.ai/guides/overview/pricing" },
  "zai:cogvideox-3": { perVideo: 0.2, verifiedAt: "2026-08-30", sourceUrl: "https://docs.z.ai/guides/overview/pricing" },
};

function rateKey(provider: string, modelName: string, variant?: string) {
  const base = `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}`;
  return variant && (TOKEN_RATES[`${base}:${variant}`] || FIXED_RATES[`${base}:${variant}`]) ? `${base}:${variant}` : base;
}

export function calculateProviderCogs(args: {
  provider: string;
  modelName: string;
  variant?: string;
  usage?: ITokenUsageBreakdown;
  fixed?: IFixedUsage;
}): AiCostTraceProviderCost {
  const key = rateKey(args.provider, args.modelName, args.variant);
  const tokenRate = TOKEN_RATES[key];
  if (tokenRate) {
    const input = Number(args.usage?.text?.input || 0);
    const output = Number(args.usage?.text?.output || 0);
    const audioInput = Number(args.usage?.audio?.input || 0);
    const audioOutput = Number(args.usage?.audio?.output || 0);
    const imageInput = Number(args.usage?.image?.input || 0);
    const imageOutput = Number(args.usage?.image?.output || 0);
    const videoInput = Number(args.usage?.video?.input || 0);
    const videoOutput = Number(args.usage?.video?.output || 0);
    return {
      amount:
        (input * tokenRate.input + output * tokenRate.output) / 1_000_000 +
        (audioInput * (tokenRate.audioInput ?? 0) + audioOutput * (tokenRate.audioOutput ?? 0)) / 1_000_000 +
        (imageInput * (tokenRate.imageInput ?? 0) + imageOutput * (tokenRate.imageOutput ?? 0)) / 1_000_000 +
        (videoInput * (tokenRate.videoInput ?? 0) + videoOutput * (tokenRate.videoOutput ?? 0)) / 1_000_000,
      currency: "USD",
      source: "catalog",
      rateRevision: RATE_REVISION,
      verifiedAt: tokenRate.verifiedAt,
    };
  }

  const fixedRate = FIXED_RATES[key];
  if (fixedRate) {
    const quantity = fixedRate.perImage
      ? Number(args.fixed?.images || 0)
      : fixedRate.perVideo
        ? Number(args.fixed?.videos || 0)
        : fixedRate.perMinute
          ? Number(args.fixed?.minutes ?? (Number(args.fixed?.seconds || 0) / 60))
          : fixedRate.perThousandCharacters
            ? Number(args.fixed?.characters || 0) / 1_000
        : Number(args.fixed?.seconds || 0);
    const unitRate = fixedRate.perImage ?? fixedRate.perVideo ?? fixedRate.perMinute ?? fixedRate.perSecond ?? fixedRate.perThousandCharacters;
    if (typeof unitRate === "number") {
      return {
        amount: quantity * unitRate,
        currency: "USD",
        source: "catalog",
        rateRevision: RATE_REVISION,
        verifiedAt: fixedRate.verifiedAt,
      };
    }
  }

  return { amount: null, currency: "USD", source: "unavailable", rateRevision: RATE_REVISION };
}
