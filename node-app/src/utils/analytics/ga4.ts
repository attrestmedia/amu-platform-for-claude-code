"use client";

import { getGenStudioTemplateSearchParam } from "utils/app/genStudioTemplateQuery";

type GaEventValue = string | number | boolean | null | undefined;
type GaEventParams = Record<string, GaEventValue>;
type SearchParamsLike = { toString(): string } | URLSearchParams | null | undefined;

const STANDARD_EVENT_ALIASES: Partial<Record<string, string>> = {
  template_key_click: "template_view",
  gen_studio_generate_click: "start_click",
  gen_studio_generate_success: "first_generation_success",
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * AIR-403 App 콘텐츠 계측 계약.
 *
 * 표면 구분자는 `surface`이며 이벤트 종류를 표면마다 새로 만들지 않는다.
 * App 콘텐츠 식별자(`content_id`/`content_slug`)는 WordPress 기사 식별자(`post_id`/`post_slug`)와
 * 다른 namespace다 — 섞어 집계하지 않고, 승격 관계는 `source_post_id`로만 잇는다.
 */
export const APP_MAGAZINE_SURFACE = "magazine_app";
const APP_MAGAZINE_PATH_PREFIX = "/magazine/";

export type AppMagazineEventContext = {
  contentId: string;
  contentSlug: string;
  experienceLevel?: string;
  primaryService?: string;
  sourcePostId?: string;
  sourceRelationship?: string;
};

let appMagazineContext: AppMagazineEventContext | null = null;

/** `/magazine/{slug}` SSR 표면이 마운트되는 동안 모든 GA4 이벤트에 실릴 표면 맥락을 등록한다. */
export function setAppMagazineEventContext(context: AppMagazineEventContext | null) {
  appMagazineContext = context;
}

/** `/magazine/{slug}` App 콘텐츠 표면인지 판정한다. `/magazine/`(WordPress 아카이브)는 포함하지 않는다. */
export function isAppMagazineSurface() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "";
  return path.indexOf(APP_MAGAZINE_PATH_PREFIX) === 0 && path.length > APP_MAGAZINE_PATH_PREFIX.length;
}

function cleanValue(value: GaEventValue) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "boolean") return value;
  return String(value).trim();
}

function cleanParams(params: GaEventParams = {}) {
  return Object.entries(params).reduce<Record<string, string | number | boolean>>((acc, [key, value]) => {
    const cleaned = cleanValue(value);
    if (cleaned === "") return acc;
    acc[key] = cleaned;
    return acc;
  }, {});
}

function toSearchParams(searchParams?: SearchParamsLike) {
  if (searchParams instanceof URLSearchParams) return searchParams;
  if (searchParams && typeof searchParams.toString === "function") {
    return new URLSearchParams(searchParams.toString());
  }

  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search);
  }

  return new URLSearchParams();
}

function normalizeHost(value: string) {
  return String(value || "").trim().replace(/^www\./i, "").toLowerCase();
}

function getCurrentPathname() {
  if (typeof window === "undefined") return "";
  return window.location.pathname || "";
}

function inferServiceName(pathname: string) {
  const path = String(pathname || "").trim();
  if (!path) return "";
  if (path === "/gen-studio" || path.indexOf("/gen-studio/") === 0) return "gen_studio";
  if (path === "/tutors" || path.indexOf("/tutors/") === 0) return "tutors";
  if (path === "/apps/motion-studio" || path.indexOf("/apps/motion-studio/") === 0) return "motion_studio";
  if (path === "/apps/gen-studio" || path.indexOf("/apps/gen-studio/") === 0) return "gen_studio";
  if (path === "/apps/drawing" || path.indexOf("/apps/drawing/") === 0) return "drawing";
  if (path === "/apps/scrape-links" || path.indexOf("/apps/scrape-links/") === 0) return "scrape_links";
  if (path === "/apps/search-imgs" || path.indexOf("/apps/search-imgs/") === 0) return "search_imgs";
  if (path === "/play" || path.indexOf("/play/") === 0) return "game";
  if (path === "/game" || path.indexOf("/game/") === 0) return "game";
  return "";
}

function inferPageType(pathname: string) {
  const path = String(pathname || "").trim();
  if (!path || path === "/") return "landing";
  if (path === "/gen-studio") return "landing";
  if (path === "/tutors") return "landing";
  if (path === "/apps/motion-studio") return "landing";
  if (path === "/play") return "landing";
  if (path === "/game") return "landing";
  if (/^\/tutors\/[^/]+$/.test(path)) return "detail";
  if (/^\/apps\/[^/]+$/.test(path)) return "landing";
  if (/^\/apps\/[^/]+\/[^/]+$/.test(path)) return "detail";
  if (path.indexOf("/play/") === 0) return "detail";
  if (path.indexOf("/gen-studio/") === 0) return "detail";
  return "page";
}

function getReferrerHost() {
  if (typeof document === "undefined" || !document.referrer) return "";
  try {
    return normalizeHost(new URL(document.referrer).host);
  } catch {
    return "";
  }
}

function inferEntrySource(searchParams?: SearchParamsLike) {
  const sp = toSearchParams(searchParams);
  const explicit = cleanValue(sp.get("entry_source") || sp.get("amu_entry_source"));
  if (explicit) return explicit;

  const postId = cleanValue(sp.get("amu_post_id"));
  const postSlug = cleanValue(sp.get("amu_post_slug"));
  const referrerHost = getReferrerHost();
  const currentHost = typeof window !== "undefined" ? normalizeHost(window.location.host) : "";

  if (postId || postSlug) return "wordpress_blog";
  if (!referrerHost) return "direct";
  if (referrerHost === currentHost) return "internal";
  if (referrerHost === "allmyuniverse.com") return "allmyuniverse_site";
  return "external_referrer";
}

/**
 * App 매거진 표면에서 발화하는 모든 이벤트에 표면 구분자와 콘텐츠 namespace를 실어 준다.
 * 직접 임포트된 편집기(Gen Studio·Tutors)가 쏘는 제품 행동 이벤트도 같은 경로를 타므로
 * `surface`만으로 `/gen-studio` 표면의 같은 이벤트와 분리 집계할 수 있다.
 */
function getAppMagazineEventContext() {
  if (!isAppMagazineSurface()) return {};
  return {
    surface: APP_MAGAZINE_SURFACE,
    content_id: appMagazineContext?.contentId,
    content_slug: appMagazineContext?.contentSlug,
    experience_level: appMagazineContext?.experienceLevel,
    source_post_id: appMagazineContext?.sourcePostId,
    source_relationship: appMagazineContext?.sourceRelationship,
  };
}

function getDefaultEventContext(searchParams?: SearchParamsLike) {
  const pathname = getCurrentPathname();
  const appMagazine = getAppMagazineEventContext();
  return {
    // App 매거진 표면에서는 경로로 서비스를 알 수 없다 — 기사당 Primary 서비스 1개 계약(AIR-402)에 따라
    // 표면이 등록한 primaryService를 쓴다. 등록 전이면 빈 값이고 cleanParams가 떨어뜨린다.
    service_name: inferServiceName(pathname) || (isAppMagazineSurface() ? appMagazineContext?.primaryService : ""),
    page_type: inferPageType(pathname),
    destination_url: getCurrentUrl(),
    entry_source: inferEntrySource(searchParams),
    referrer_host: getReferrerHost(),
    ...appMagazine,
  };
}

/**
 * 제품 행동 이벤트를 발화해도 되는 공개 표면인지 판정한다.
 * AIR-402가 iframe을 제거하고 편집기를 직접 임포트하면서 `/magazine/{slug}`도 공개 표면이 됐다 —
 * 임베드된 앱이 제품 행동을 발화한다는 소유권 계약(MEASUREMENT-PLAN §5)을 지키려면 여기에 포함해야 한다.
 * 부모 표면은 이 이벤트를 다시 쏘지 않는다.
 */
export function isPublicGenStudioSurface() {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/gen-studio"
    || window.location.pathname.indexOf("/gen-studio/") === 0
    || isAppMagazineSurface();
}

export function trackGaEvent(eventName: string, params: GaEventParams = {}, searchParams?: SearchParamsLike) {
  if (typeof window === "undefined" || !eventName) return false;

  const payload = cleanParams({
    ...getDefaultEventContext(searchParams),
    ...params,
  });
  const eventNames = [eventName, STANDARD_EVENT_ALIASES[eventName]].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
  if (typeof window.gtag === "function") {
    eventNames.forEach((name) => window.gtag?.("event", name, payload));
    return true;
  }

  const dataLayer = Array.isArray(window.dataLayer) ? window.dataLayer : (window.dataLayer = []);
  eventNames.forEach((name) => dataLayer.push({ event: name, ...payload }));
  return true;
}

export function getCurrentUrl() {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

export function getGenStudioEntryContext(searchParams?: SearchParamsLike) {
  const sp = toSearchParams(searchParams);
  const templateKey = cleanValue(
    getGenStudioTemplateSearchParam(sp, "templateKey") || getGenStudioTemplateSearchParam(sp, "amu_template_key"),
  );
  const templateTitle = cleanValue(getGenStudioTemplateSearchParam(sp, "amu_template_title"));
  const ctaLocation = cleanValue(getGenStudioTemplateSearchParam(sp, "amu_cta_location"));
  const postId = cleanValue(getGenStudioTemplateSearchParam(sp, "amu_post_id"));
  const postSlug = cleanValue(getGenStudioTemplateSearchParam(sp, "amu_post_slug"));
  const entryMode = cleanValue(getGenStudioTemplateSearchParam(sp, "mode") || "image");
  const referrerHost = getReferrerHost();

  return {
    cta_location: ctaLocation,
    destination_url: getCurrentUrl(),
    post_id: postId,
    post_slug: postSlug,
    template_key: templateKey,
    template_title: templateTitle,
    entry_source: inferEntrySource(searchParams),
    entry_mode: entryMode,
    referrer_host: referrerHost,
  };
}

export function trackGenStudioEntry(searchParams?: SearchParamsLike, extraParams: GaEventParams = {}) {
  return trackGaEvent("gen_studio_entry", {
    ...getGenStudioEntryContext(searchParams),
    ...extraParams,
  }, searchParams);
}

export function trackTemplateKeyClick(params: GaEventParams = {}) {
  return trackGaEvent("template_key_click", params);
}
