import "server-only";
import type {
  CoinUsageActivity,
  CoinUsageAttribution,
  CoinUsagePurpose,
  CoinUsageSource,
} from "types/payment";

/**
 * @docHint
 * @purpose 코인 원장의 기술 app/meta를 사용자 가독 목적 귀속 정보로 변환
 * @process 명시 귀속 검증 → operation/route/app 레거시 규칙 적용 → 안전한 기본 목적 반환
 * @domain payment
 * @scope server-global
 */

export const COIN_USAGE_ATTRIBUTION_VERSION = 1 as const;

export const COIN_USAGE_ACTIVITIES: readonly CoinUsageActivity[] = [
  "image_generation",
  "content_generation",
  "conversation",
  "audio",
  "ai_task",
  "coin_charge",
  "subscription_grant",
];

export const COIN_USAGE_PURPOSES: readonly CoinUsagePurpose[] = [
  "content.generate",
  "image.generate_or_edit",
  "image.remove_background",
  "conversation.chat",
  "audio.synthesize",
  "audio.transcribe",
  "audio.analyze",
  "marketing.proofread",
  "marketing.independent_proofread",
  "marketing.strategy_fit",
  "tutors.persona_generate",
  "tutors.profile_image_generate",
  "mini_app.assist",
  "ai.other",
  "coin.charge",
  "coin.subscription_grant",
];

export const COIN_USAGE_SOURCES: readonly CoinUsageSource[] = [
  "user_action",
  "local_agent",
  "agent_api",
  "server_worker",
  "system",
  "legacy_unknown",
];

const ACTIVITY_SET = new Set<CoinUsageActivity>(COIN_USAGE_ACTIVITIES);
const PURPOSE_SET = new Set<CoinUsagePurpose>(COIN_USAGE_PURPOSES);
const SOURCE_SET = new Set<CoinUsageSource>(COIN_USAGE_SOURCES);

export type CoinUsageAttributionInput = {
  app?: unknown;
  billingKey?: unknown;
  activity?: unknown;
  purpose?: unknown;
  source?: unknown;
  meta?: Record<string, unknown> | null;
};

function text(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function resolveSource(input: CoinUsageAttributionInput): CoinUsageSource {
  const explicit = text(input.source || input.meta?.source) as CoinUsageSource;
  if (SOURCE_SET.has(explicit)) return explicit;

  const route = text(input.meta?.route);
  if (route.includes("agent-image")) return "agent_api";
  return "legacy_unknown";
}

function attribution(
  activity: CoinUsageActivity,
  purpose: CoinUsagePurpose,
  source: CoinUsageSource,
): CoinUsageAttribution {
  return { activity, purpose, source, attributionVersion: COIN_USAGE_ATTRIBUTION_VERSION };
}

export function isCoinUsageActivity(value: unknown): value is CoinUsageActivity {
  return ACTIVITY_SET.has(text(value) as CoinUsageActivity);
}

export function isCoinUsagePurpose(value: unknown): value is CoinUsagePurpose {
  return PURPOSE_SET.has(text(value) as CoinUsagePurpose);
}

export function resolveCoinUsageAttribution(input: CoinUsageAttributionInput): CoinUsageAttribution {
  const explicitActivity = text(input.activity) as CoinUsageActivity;
  const explicitPurpose = text(input.purpose) as CoinUsagePurpose;
  const source = resolveSource(input);
  if (ACTIVITY_SET.has(explicitActivity) && PURPOSE_SET.has(explicitPurpose)) {
    return attribution(explicitActivity, explicitPurpose, source);
  }

  const app = text(input.app);
  const route = text(input.meta?.route);
  const operation = text(input.meta?.operation);

  if (operation === "speech_synthesize") return attribution("audio", "audio.synthesize", source);
  if (operation === "speech_transcribe") return attribution("audio", "audio.transcribe", source);
  if (operation === "speech_audio_analyze") return attribution("audio", "audio.analyze", source);

  if (app === "ai_marketing_independent_proofread") {
    return attribution("ai_task", "marketing.independent_proofread", source);
  }
  if (app === "ai_marketing_proofread") return attribution("ai_task", "marketing.proofread", source);
  if (app === "ai_marketing_strategy_fit") return attribution("ai_task", "marketing.strategy_fit", source);
  if (app.includes("remove_bg")) return attribution("image_generation", "image.remove_background", source);

  if (route.includes("tutors/personas/generate")) {
    return attribution("content_generation", "tutors.persona_generate", source);
  }
  if (route.includes("tutors/profile-image/generate")) {
    return attribution("image_generation", "tutors.profile_image_generate", source);
  }
  if (route.includes("mini-apps/") && route.includes("/assist")) {
    return attribution("content_generation", "mini_app.assist", source);
  }
  if (app.includes("image")) return attribution("image_generation", "image.generate_or_edit", source);
  if (app.includes("content") || app.includes("translation")) {
    return attribution("content_generation", "content.generate", source);
  }
  if (app.includes("chat") || app.includes("npc") || app.includes("tutor")) {
    return attribution("conversation", "conversation.chat", source);
  }
  return attribution("ai_task", "ai.other", source);
}

export function buildCoinUsageAttributionAggregationStage() {
  const app = { $toLower: { $ifNull: ["$app", ""] } };
  const route = { $toLower: { $ifNull: ["$meta.route", ""] } };
  const operation = { $toLower: { $ifNull: ["$meta.operation", ""] } };
  const hasExplicitAttribution = {
    $and: [
      { $in: ["$activity", COIN_USAGE_ACTIVITIES] },
      { $in: ["$purpose", COIN_USAGE_PURPOSES] },
    ],
  };

  const activityFallback = {
    $switch: {
      branches: [
        {
          case: { $in: [operation, ["speech_synthesize", "speech_transcribe", "speech_audio_analyze"]] },
          then: "audio",
        },
        {
          case: {
            $in: [
              app,
              [
                "ai_marketing_independent_proofread",
                "ai_marketing_proofread",
                "ai_marketing_strategy_fit",
              ],
            ],
          },
          then: "ai_task",
        },
        {
          case: { $regexMatch: { input: app, regex: "remove_bg" } },
          then: "image_generation",
        },
        {
          case: { $regexMatch: { input: route, regex: "tutors/personas/generate" } },
          then: "content_generation",
        },
        {
          case: { $regexMatch: { input: route, regex: "tutors/profile-image/generate" } },
          then: "image_generation",
        },
        {
          case: {
            $and: [
              { $regexMatch: { input: route, regex: "mini-apps/" } },
              { $regexMatch: { input: route, regex: "/assist" } },
            ],
          },
          then: "content_generation",
        },
        {
          case: { $regexMatch: { input: app, regex: "image" } },
          then: "image_generation",
        },
        {
          case: { $regexMatch: { input: app, regex: "content|translation" } },
          then: "content_generation",
        },
        {
          case: { $regexMatch: { input: app, regex: "chat|npc|tutor" } },
          then: "conversation",
        },
      ],
      default: "ai_task",
    },
  };

  const purposeFallback = {
    $switch: {
      branches: [
        { case: { $eq: [operation, "speech_synthesize"] }, then: "audio.synthesize" },
        { case: { $eq: [operation, "speech_transcribe"] }, then: "audio.transcribe" },
        { case: { $eq: [operation, "speech_audio_analyze"] }, then: "audio.analyze" },
        {
          case: { $eq: [app, "ai_marketing_independent_proofread"] },
          then: "marketing.independent_proofread",
        },
        { case: { $eq: [app, "ai_marketing_proofread"] }, then: "marketing.proofread" },
        { case: { $eq: [app, "ai_marketing_strategy_fit"] }, then: "marketing.strategy_fit" },
        {
          case: { $regexMatch: { input: app, regex: "remove_bg" } },
          then: "image.remove_background",
        },
        {
          case: { $regexMatch: { input: route, regex: "tutors/personas/generate" } },
          then: "tutors.persona_generate",
        },
        {
          case: { $regexMatch: { input: route, regex: "tutors/profile-image/generate" } },
          then: "tutors.profile_image_generate",
        },
        {
          case: {
            $and: [
              { $regexMatch: { input: route, regex: "mini-apps/" } },
              { $regexMatch: { input: route, regex: "/assist" } },
            ],
          },
          then: "mini_app.assist",
        },
        {
          case: { $regexMatch: { input: app, regex: "image" } },
          then: "image.generate_or_edit",
        },
        {
          case: { $regexMatch: { input: app, regex: "content|translation" } },
          then: "content.generate",
        },
        {
          case: { $regexMatch: { input: app, regex: "chat|npc|tutor" } },
          then: "conversation.chat",
        },
      ],
      default: "ai.other",
    },
  };

  return {
    $set: {
      resolvedActivity: { $cond: [hasExplicitAttribution, "$activity", activityFallback] },
      resolvedPurpose: { $cond: [hasExplicitAttribution, "$purpose", purposeFallback] },
      resolvedSource: {
        $switch: {
          branches: [
            { case: { $in: ["$source", COIN_USAGE_SOURCES] }, then: "$source" },
            { case: { $in: ["$meta.source", COIN_USAGE_SOURCES] }, then: "$meta.source" },
            {
              case: { $regexMatch: { input: route, regex: "agent-image" } },
              then: "agent_api",
            },
          ],
          default: "legacy_unknown",
        },
      },
    },
  };
}
