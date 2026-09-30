import type { OAuthConnectionProvider } from "models/secure/OAuthConnectionSchema";

export type OAuthScopeDefinition = {
  scope: string;
  required: boolean;
  label: { ko: string; en: string };
  purpose: { ko: string; en: string };
};

const OAUTH_SCOPE_DEFINITIONS: Record<OAuthConnectionProvider, OAuthScopeDefinition[]> = {
  instagram: [
    {
      scope: "instagram_business_basic",
      required: true,
      label: { ko: "Instagram 비즈니스 기본 정보", en: "Instagram business basics" },
      purpose: { ko: "연결 계정과 미디어를 조회합니다.", en: "Reads the connected account and media." },
    },
    {
      scope: "instagram_business_content_publish",
      required: true,
      label: { ko: "Instagram 콘텐츠 게시", en: "Instagram content publishing" },
      purpose: { ko: "승인된 콘텐츠를 게시합니다.", en: "Publishes approved content." },
    },
  ],
  threads: [
    {
      scope: "threads_basic",
      required: true,
      label: { ko: "Threads 기본 정보", en: "Threads basics" },
      purpose: { ko: "Threads 계정과 게시물을 조회합니다.", en: "Reads the Threads account and posts." },
    },
    {
      scope: "threads_content_publish",
      required: true,
      label: { ko: "Threads 콘텐츠 게시", en: "Threads content publishing" },
      purpose: { ko: "승인된 콘텐츠를 게시합니다.", en: "Publishes approved content." },
    },
  ],
  google_analytics: [
    {
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      required: true,
      label: { ko: "Google Analytics 읽기", en: "Google Analytics read-only" },
      purpose: {
        ko: "GA4 속성 설정과 보고서 데이터를 읽기 전용으로 조회합니다.",
        en: "Reads GA4 property settings and report data without changing them.",
      },
    },
  ],
  google_ads: [
    {
      scope: "https://www.googleapis.com/auth/adwords",
      required: true,
      label: { ko: "Google Ads API 접근", en: "Google Ads API access" },
      purpose: {
        ko: "접근 가능한 광고 고객과 캠페인 성과를 조회하고 승인된 광고를 운영합니다.",
        en: "Reads accessible ad customers and campaign performance and operates approved ads.",
      },
    },
    {
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      required: false,
      label: { ko: "Search Console 읽기", en: "Search Console read-only" },
      purpose: {
        ko: "검색 성과를 함께 분석할 때만 사용하는 선택 권한입니다.",
        en: "Optional access used only for Search Console performance analysis.",
      },
    },
  ],
};

function normalizeScopes(received: string | readonly string[] | undefined) {
  const values = Array.isArray(received) ? received : typeof received === "string" ? received.split(/[\s,]+/) : [];
  return Array.from(new Set(values.map((scope) => String(scope || "").trim()).filter(Boolean)));
}

export function getOAuthScopeDefinitions(provider: OAuthConnectionProvider) {
  return OAUTH_SCOPE_DEFINITIONS[provider];
}

export function assessOAuthScopes(
  provider: OAuthConnectionProvider,
  received: string | readonly string[] | undefined,
) {
  const grantedScopes = normalizeScopes(received);
  const reported = grantedScopes.length > 0;
  const granted = new Set(grantedScopes);
  const definitions = getOAuthScopeDefinitions(provider);
  const requiredScopes = definitions.filter((item) => item.required).map((item) => item.scope);
  const optionalScopes = definitions.filter((item) => !item.required).map((item) => item.scope);
  const missingScopes = reported ? requiredScopes.filter((scope) => !granted.has(scope)) : [];
  const optionalMissingScopes = reported ? optionalScopes.filter((scope) => !granted.has(scope)) : [];

  return {
    reported,
    complete: !reported || missingScopes.length === 0,
    grantedScopes,
    requiredScopes,
    optionalScopes,
    missingScopes,
    optionalMissingScopes,
    requirements: definitions,
  };
}

export function getConnectionStatusAfterScopeRepair(args: {
  provider: OAuthConnectionProvider;
  currentStatus: string;
  selectedResourceId: string;
  scopeReported: boolean;
  scopeComplete: boolean;
}) {
  if (args.currentStatus !== "permission_missing" || !args.scopeReported || !args.scopeComplete) {
    return args.currentStatus;
  }
  const requiresResource = args.provider === "google_analytics" || args.provider === "google_ads";
  return requiresResource && !args.selectedResourceId ? "selection_required" : "connected";
}
