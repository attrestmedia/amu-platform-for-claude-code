export const SERVICE_AVAILABILITY_SETTING_KEY = "platform.service-availability.v1";

export const SERVICE_KEYS = [
  "gen-studio",
  "tutors",
  "play",
  "marketing-oops",
  "store",
  "drawing",
  "scrape-links",
  "search-images",
  "motion-studio",
  "school-lunch-food-map",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];
export type ServiceAvailabilityMap = Record<ServiceKey, boolean>;

export type ServiceDefinition = {
  key: ServiceKey;
  group: "service" | "mini-app";
  label: string;
  description: { ko: string; en: string };
  routePrefixes: readonly string[];
  defaultEnabled: boolean;
};

export const SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
  {
    key: "gen-studio",
    group: "service",
    label: "Gen Studio",
    description: { ko: "AI 이미지·콘텐츠 생성", en: "AI image and content generation" },
    routePrefixes: ["/gen-studio"],
    defaultEnabled: true,
  },
  {
    key: "tutors",
    group: "service",
    label: "Tutors",
    description: { ko: "AI 튜터 대화 학습", en: "AI tutor conversation learning" },
    routePrefixes: ["/tutors"],
    defaultEnabled: true,
  },
  {
    key: "play",
    group: "service",
    label: "Play",
    description: { ko: "AI 캐릭터·월드 플레이", en: "AI character and world play" },
    routePrefixes: ["/play"],
    defaultEnabled: false,
  },
  {
    key: "marketing-oops",
    group: "service",
    label: "Marketing Oops",
    description: { ko: "AI 마케팅 운영 플랫폼", en: "AI marketing operations platform" },
    routePrefixes: ["/marketing-oops"],
    defaultEnabled: false,
  },
  {
    key: "store",
    group: "service",
    label: "Store",
    description: { ko: "커머스·브랜드 스토어", en: "Commerce and brand stores" },
    routePrefixes: ["/store", "/shop"],
    defaultEnabled: false,
  },
  {
    key: "drawing",
    group: "mini-app",
    label: "Drawing",
    description: { ko: "투명 캔버스 스케치", en: "Transparent canvas sketching" },
    routePrefixes: ["/apps/drawing"],
    defaultEnabled: false,
  },
  {
    key: "scrape-links",
    group: "mini-app",
    label: "Scrape Links",
    description: { ko: "링크 수집·분류", en: "Link collection and labeling" },
    routePrefixes: ["/apps/scrape-links"],
    defaultEnabled: true,
  },
  {
    key: "search-images",
    group: "mini-app",
    label: "Search Images",
    description: { ko: "무료 이미지 통합 검색", en: "Unified free image search" },
    routePrefixes: ["/apps/search-imgs"],
    defaultEnabled: true,
  },
  {
    key: "motion-studio",
    group: "mini-app",
    label: "Motion Studio",
    description: { ko: "슬라이드형 모션 콘텐츠 편집", en: "Slide-based motion content editing" },
    routePrefixes: ["/apps/motion-studio"],
    defaultEnabled: true,
  },
  {
    key: "school-lunch-food-map",
    group: "mini-app",
    label: "School Lunch Food Map",
    description: { ko: "학교 급식 식판형 푸드맵", en: "School lunch tray food map" },
    routePrefixes: ["/apps/school-lunch-food-map"],
    defaultEnabled: true,
  },
] as const;

export const DEFAULT_SERVICE_AVAILABILITY = Object.fromEntries(
  SERVICE_DEFINITIONS.map((service) => [service.key, service.defaultEnabled]),
) as ServiceAvailabilityMap;

const SERVICE_KEY_SET = new Set<string>(SERVICE_KEYS);

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === "string" && SERVICE_KEY_SET.has(value);
}

export function normalizeServiceAvailability(value: unknown): ServiceAvailabilityMap {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return Object.fromEntries(
    SERVICE_DEFINITIONS.map((service) => [
      service.key,
      typeof stored[service.key] === "boolean" ? stored[service.key] : service.defaultEnabled,
    ]),
  ) as ServiceAvailabilityMap;
}

export function resolveServiceKeyFromPathname(pathname: string): ServiceKey | null {
  const normalizedPathname = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  const match = SERVICE_DEFINITIONS.find((service) =>
    service.routePrefixes.some(
      (prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
    ),
  );
  return match?.key || null;
}
