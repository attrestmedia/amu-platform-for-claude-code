import { toSafeString } from "utils/common/typeUtils";

export const AMU_REQUIRED_GA_CUSTOM_DIMENSIONS = [
  "template_key",
  "entry_source",
  "slot_id",
  "creative_id",
  "campaign_id",
  "variant",
] as const;

export const AMU_REQUIRED_GA_KEY_EVENTS = [
  "signup_complete",
  "first_generation_success",
  "coin_recharge_complete",
] as const;

const AMU_CORE_GA_CUSTOM_DIMENSIONS = ["template_key", "entry_source"] as const;

/**
 * AIR-403 — 획득(acquisition) 속성에서 전환 분석이 성립하는 주요 이벤트 집합.
 *
 * 루트 전환(AIR-101, 2026-09-03) 이후 생성·결제는 전부 node-app 표면에서 일어나고
 * 전환(conversion) 속성으로 수집된다. WordPress가 서빙하는 획득 속성 표면에는
 * `first_generation_success`·`coin_recharge_complete`의 발화원이 존재하지 않으므로,
 * 이 둘을 획득 속성의 전환 판정 조건에 넣으면 영구히 충족될 수 없는 false negative가 된다.
 */
const AMU_ACQUISITION_GA_KEY_EVENTS = ["signup_complete"] as const;

type ReadinessSection<T> = { status: "ok" | "partial"; data: T } | { status: "error"; data: null };

type ObservedEventsSection = ReadinessSection<{
  events: Array<{ eventName: string }>;
}>;

function sectionArray(section: ReadinessSection<Record<string, unknown>[]>) {
  return section.status === "error" ? null : section.data;
}

export function buildGaMarketingReadiness(args: {
  customDimensions: ReadinessSection<Record<string, unknown>[]>;
  keyEvents: ReadinessSection<Record<string, unknown>[]>;
  observedEvents: ObservedEventsSection;
  propertyRole?: string;
}) {
  const customDimensions = sectionArray(args.customDimensions);
  const keyEvents = sectionArray(args.keyEvents);
  const observedEvents = args.observedEvents.status === "error" ? null : args.observedEvents.data.events;
  const dimensionNames = new Set((customDimensions || []).map((item) => toSafeString(item.parameterName)));
  const keyEventNames = new Set((keyEvents || []).map((item) => toSafeString(item.eventName)));
  const observedEventNames = new Set((observedEvents || []).map((item) => item.eventName));
  const propertyRole = toSafeString(args.propertyRole) || "default";
  const promoReportingApplicable = propertyRole === "acquisition";

  const requiredCustomDimensions = AMU_REQUIRED_GA_CUSTOM_DIMENSIONS.map((parameterName) => ({
    parameterName,
    purpose: AMU_CORE_GA_CUSTOM_DIMENSIONS.includes(parameterName as (typeof AMU_CORE_GA_CUSTOM_DIMENSIONS)[number])
      ? "core"
      : promoReportingApplicable
        ? "promo_optional"
        : "not_applicable",
    status:
      !AMU_CORE_GA_CUSTOM_DIMENSIONS.includes(parameterName as (typeof AMU_CORE_GA_CUSTOM_DIMENSIONS)[number]) &&
      !promoReportingApplicable
        ? "not_applicable"
        : customDimensions === null
          ? "unknown"
          : dimensionNames.has(parameterName)
            ? "configured"
            : "missing",
  }));
  const requiredKeyEvents = AMU_REQUIRED_GA_KEY_EVENTS.map((eventName) => ({
    eventName,
    configurationStatus: keyEvents === null ? "unknown" : keyEventNames.has(eventName) ? "configured" : "missing",
    collectionStatus: observedEvents === null ? "unknown" : observedEventNames.has(eventName) ? "observed" : "not_observed",
  }));
  const conversionScopedKeyEventNames = new Set<string>(
    propertyRole === "acquisition" ? AMU_ACQUISITION_GA_KEY_EVENTS : AMU_REQUIRED_GA_KEY_EVENTS,
  );
  const requiredDimensionNames = new Set<string>(AMU_CORE_GA_CUSTOM_DIMENSIONS);
  const requiredKeyEventNames = new Set<string>(propertyRole === "acquisition" ? [] : AMU_REQUIRED_GA_KEY_EVENTS);
  const coreDimensionsConfigured = requiredCustomDimensions
    .filter((item) => requiredDimensionNames.has(item.parameterName))
    .every((item) => item.status === "configured");
  const keyEventsConfigured = requiredKeyEvents
    .filter((item) => requiredKeyEventNames.has(item.eventName))
    .every((item) => item.configurationStatus === "configured");
  const keyEventsObserved = requiredKeyEvents
    .filter((item) => requiredKeyEventNames.has(item.eventName))
    .every((item) => item.collectionStatus === "observed");
  const configurationReady = coreDimensionsConfigured && keyEventsConfigured;
  const collectionReady = propertyRole === "acquisition" || keyEventsObserved;

  return {
    propertyRole,
    promoReportingApplicable,
    requiredCustomDimensions,
    requiredKeyEvents,
    readyForPromoReporting:
      promoReportingApplicable &&
      requiredCustomDimensions
        .filter((item) => ["slot_id", "creative_id", "campaign_id", "variant"].includes(item.parameterName))
        .every((item) => item.status === "configured"),
    readyForConversionAnalysis: requiredKeyEvents
      .filter((item) => conversionScopedKeyEventNames.has(item.eventName))
      .every((item) => item.configurationStatus === "configured" && item.collectionStatus === "observed"),
    configurationReady,
    collectionReady,
    status: !configurationReady ? "configuration_needed" : collectionReady ? "ready" : "awaiting_data",
  };
}
