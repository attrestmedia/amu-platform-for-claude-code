import "server-only";

function optionalBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return fallback;
}

function optionalInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;

  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;

  return Math.max(1, Math.floor(next));
}

export const MARKETING_FEATURE_ENABLED = optionalBool(
  process.env.MARKETING_FEATURE_ENABLED ?? process.env.NEXT_PUBLIC_MARKETING_FEATURE_ENABLED,
  false,
);

export const MARKETING_DRY_RUN = optionalBool(process.env.MARKETING_DRY_RUN, true);
export const MARKETING_SLACK_ENABLED = optionalBool(process.env.MARKETING_SLACK_ENABLED, false);
// 소셜 성과 정기 수집 크론 인증 secret — 미설정 시 크론 라우트는 503(fail-closed)
export const MARKETING_CRON_SECRET = (process.env.MARKETING_CRON_SECRET || "").trim();
export const MARKETING_MEASUREMENT_LOOKBACK_DAYS = optionalInt(process.env.MARKETING_MEASUREMENT_LOOKBACK_DAYS, 14);
export const MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS = optionalInt(process.env.MARKETING_ADS_UNLOCK_MIN_PUBLISHED_LOGS, 14);

// 글로벌 OAuth App Credential DB가 미등록/조회 불가일 때 사용하는 무중단 운영 fallback.
export const MARKETING_OAUTH_APP_CREDENTIALS = {
  instagram: {
    clientId: (process.env.MARKETING_INSTAGRAM_OAUTH_CLIENT_ID || "").trim(),
    clientSecret: (process.env.MARKETING_INSTAGRAM_OAUTH_CLIENT_SECRET || "").trim(),
  },
  threads: {
    clientId: (process.env.MARKETING_THREADS_OAUTH_CLIENT_ID || "").trim(),
    clientSecret: (process.env.MARKETING_THREADS_OAUTH_CLIENT_SECRET || "").trim(),
  },
  google: {
    clientId: (process.env.MARKETING_GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: (process.env.MARKETING_GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    developerToken: (process.env.MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN || "").trim(),
  },
} as const;
