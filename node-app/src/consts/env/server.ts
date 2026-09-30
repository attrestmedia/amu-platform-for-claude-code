import "server-only";

/**
 * env.server.ts (server-only)
 * - 서버에서만 의미 있는 환경 변수들 (process.env 직접 사용)
 * - 타입(BOOL/NUMBER/LIST/ENUM/OPTIONAL) 파싱을 여기서 하고, 코드는 "이미 타입이 보장된 상수"만 사용
 */

type EnumSpec<T extends readonly string[]> = {
  key: string;
  values: T;
  default?: T[number];
};

function raw(key: string): string | undefined {
  return process.env[key];
}

/**
 * 빌드 단계 한정 필수 env 검증 유예.
 *
 * 배경: 운영 시크릿은 docker-compose의 `env_file: ./secrets/node-app.env`로 **런타임에만** 주입되고,
 * `.env.production`에는 빌드에 필요한 공개 값만 둔다(시크릿을 빌드 머신 파일에 두지 않는다).
 * 그런데 `next build`의 "Collecting page data"는 모든 route 모듈을 import하므로,
 * DB URL 하나만 참조하는 라우트에서도 이 파일의 top-level 검증이 통째로 실행돼 빌드가 실패한다.
 *
 * 안전한 이유: `raw()`가 `process.env[key]`처럼 **계산된 키**로 읽어 번들러가 값을 인라인하지 못한다.
 * 즉 빌드 산출물에 빈 값이 박히지 않고, 서버 런타임(`next start`)에서 모듈이 다시 평가된다.
 * 따라서 빌드 단계만 유예해도 **런타임 fail-fast는 그대로 유지**된다.
 *
 * 판정: `pnpm run build`가 넘기는 명시 플래그를 1순위로 쓰고, `next build`가 설정하는
 * `NEXT_PHASE`를 fallback으로 둔다(스크립트를 거치지 않고 `next build`를 직접 호출하는 경우 대비).
 * `next start`/`next dev`는 두 조건 모두 거짓이므로 검증이 그대로 작동한다.
 */
const IS_ENV_VALIDATION_DEFERRED =
  process.env.AMU_ENV_VALIDATION === "defer" || process.env.NEXT_PHASE === "phase-production-build";

const DEFERRED_ENV_KEYS = new Set<string>();

function deferMissingEnv(key: string) {
  DEFERRED_ENV_KEYS.add(key);
}

// 필수(빈 문자열도 불허)
function requiredNonEmpty(key: string): string {
  const v = raw(key);
  if (!v) {
    if (IS_ENV_VALIDATION_DEFERRED) {
      deferMissingEnv(key);
      return "";
    }
    throw new Error(`[env] Missing required server env (non-empty): ${key}`);
  }
  return v;
}

// 선택(미설정 허용). 미설정이면 fallback
function optional(key: string, fallback = ""): string {
  const v = raw(key);
  return v === undefined ? fallback : v;
}

// true/false 파싱
function requiredBool(key: string): boolean {
  const raw = requiredNonEmpty(key);
  // 유예된 빈 값에 형식 검증을 적용하면 "Invalid boolean"으로 원인이 뒤바뀐다.
  if (!raw && IS_ENV_VALIDATION_DEFERRED) return false;
  const v = raw.toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`[env] Invalid boolean for ${key}. Use true|false`);
}

function optionalBool(key: string, fallback: boolean): boolean {
  const v = raw(key);
  if (v === undefined || v === "") return fallback;
  if (v.toLowerCase() === "true") return true;
  if (v.toLowerCase() === "false") return false;
  throw new Error(`[env] Invalid boolean for ${key}. Use true|false`);
}

// 숫자 파싱 (정수)
function requiredInt(key: string, opts?: { min?: number; max?: number }): number {
  const v = requiredNonEmpty(key);
  if (!v && IS_ENV_VALIDATION_DEFERRED) return opts?.min ?? 0;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`[env] Invalid integer for ${key}: "${v}"`);
  }
  if (opts?.min !== undefined && n < opts.min) throw new Error(`[env] ${key} must be >= ${opts.min}`);
  if (opts?.max !== undefined && n > opts.max) throw new Error(`[env] ${key} must be <= ${opts.max}`);
  return n;
}

function optionalInt(key: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const v = raw(key);
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`[env] Invalid integer for ${key}: "${v}"`);
  }
  if (opts?.min !== undefined && n < opts.min) throw new Error(`[env] ${key} must be >= ${opts.min}`);
  if (opts?.max !== undefined && n > opts.max) throw new Error(`[env] ${key} must be <= ${opts.max}`);
  return n;
}

function optionalNumber(key: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const v = raw(key);
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`[env] Invalid number for ${key}: "${v}"`);
  if (opts?.min !== undefined && n < opts.min) throw new Error(`[env] ${key} must be >= ${opts.min}`);
  if (opts?.max !== undefined && n > opts.max) throw new Error(`[env] ${key} must be <= ${opts.max}`);
  return n;
}

// CSV 리스트 파싱
function requiredCsv(key: string): string[] {
  const v = requiredNonEmpty(key);
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// CSV 리스트 파싱 (미설정 허용 — 빈 배열)
function optionalCsv(key: string): string[] {
  const v = raw(key);
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// enum 파싱
function requiredEnum<T extends readonly string[]>({ key, values, default: def }: EnumSpec<T>): T[number] {
  const v = raw(key);
  if (v === undefined || v === "") {
    if (def) return def;
    if (IS_ENV_VALIDATION_DEFERRED) {
      deferMissingEnv(key);
      return values[0];
    }
    throw new Error(`[env] Missing required env: ${key}`);
  }
  if ((values as readonly string[]).includes(v)) return v as T[number];
  throw new Error(`[env] Invalid value for ${key}: "${v}". Allowed: ${values.join(", ")}`);
}

// ================================
// MongoDB (STRING, non-empty)
// ================================
export const MONGODB_URL = requiredNonEmpty("MONGODB_URL");
export const MONGODB_AMU_URL = requiredNonEmpty("MONGODB_AMU_URL");
export const MONGODB_USERS_URL = requiredNonEmpty("MONGODB_USERS_URL");
export const MONGODB_LOGS_URL = requiredNonEmpty("MONGODB_LOGS_URL");
export const MONGODB_GAME_URL = requiredNonEmpty("MONGODB_GAME_URL");
export const MONGODB_PERSONA_URL = requiredNonEmpty("MONGODB_PERSONA_URL");
export const MONGODB_CATALOG_URL = requiredNonEmpty("MONGODB_CATALOG_URL");
export const MONGODB_CONVERSATIONS_URL = requiredNonEmpty("MONGODB_CONVERSATIONS_URL");
export const MONGODB_BILLING_URL = requiredNonEmpty("MONGODB_BILLING_URL");
export const MONGODB_SECRETS_URL = requiredNonEmpty("MONGODB_SECRETS_URL");
export const MONGODB_AI_URL = requiredNonEmpty("MONGODB_AI_URL");
export const MONGODB_APPS_URL = requiredNonEmpty("MONGODB_APPS_URL");
export const MONGODB_MARKETING_URL = requiredNonEmpty("MONGODB_MARKETING_URL");

// ================================
// Redis (HOST string, PORT/DB number, PASSWORD optional)
// ================================
export const REDIS_HOST = requiredNonEmpty("REDIS_HOST");
export const REDIS_PORT = requiredInt("REDIS_PORT", { min: 1, max: 65535 });
export const REDIS_PASSWORD = optional("REDIS_PASSWORD", ""); // 로컬에서 빈 값/미설정 허용
export const REDIS_DB = requiredInt("REDIS_DB", { min: 0, max: 63 });
export const REDIS_MAX_RETRIES = requiredInt("REDIS_MAX_RETRIES", { min: 0, max: 50 });
export const REDIS_RETRY_DELAY = requiredInt("REDIS_RETRY_DELAY", { min: 0, max: 60_000 });

// ================================
// Internal API (SECRET, non-empty)
// ================================
export const INTERNAL_API_KEY = requiredNonEmpty("INTERNAL_API_KEY");

// 신규 가입 무상 코인 캠페인. 명시적으로 활성화하고 시작 시각을 제공한 경우에만 지급한다.
export const SIGNUP_BONUS_CAMPAIGN_ENABLED = optionalBool("SIGNUP_BONUS_CAMPAIGN_ENABLED", false);
export const SIGNUP_BONUS_CAMPAIGN_STARTED_AT = optional("SIGNUP_BONUS_CAMPAIGN_STARTED_AT", "");

// ================================
// Image Proxy
// ================================
export const ALLOWED_IMAGE_DOMAINS = requiredCsv("ALLOWED_IMAGE_DOMAINS"); // string[]
export const ENABLE_IMAGE_PROXY = requiredBool("ENABLE_IMAGE_PROXY"); // boolean
export const IMAGE_PROXY_CACHE_TTL = requiredInt("IMAGE_PROXY_CACHE_TTL", { min: 0, max: 60 * 60 * 24 * 30 }); // seconds
export const IMAGE_PROXY_MAX_SIZE = requiredInt("IMAGE_PROXY_MAX_SIZE", { min: 1 }); // bytes

// Commerce Image Proxy
export const COMMERCE_IMAGE_QUALITY = requiredInt("COMMERCE_IMAGE_QUALITY", { min: 1, max: 100 });
export const COMMERCE_IMAGE_MAX_SIZE = requiredInt("COMMERCE_IMAGE_MAX_SIZE", { min: 16, max: 4096 });
export const DEV_ADDITIONAL_DOMAINS = requiredCsv("DEV_ADDITIONAL_DOMAINS");
export const STRICT_DOMAIN_VALIDATION = requiredBool("STRICT_DOMAIN_VALIDATION");

// ================================
// Fallback (ENUM)
// ================================
export const RATELIMIT_FALLBACK = requiredEnum({
  key: "RATELIMIT_FALLBACK",
  values: ["allow", "deny"] as const,
  default: "allow",
});

// ================================
// Social Login (STRING/SECRET non-empty)
// ================================
export const NEXTAUTH_URL = requiredNonEmpty("NEXTAUTH_URL");
export const NEXTAUTH_SECRET = requiredNonEmpty("NEXTAUTH_SECRET");

export const GOOGLE_CLIENT_ID = requiredNonEmpty("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = requiredNonEmpty("GOOGLE_CLIENT_SECRET");
export const KAKAO_CLIENT_ID = requiredNonEmpty("KAKAO_CLIENT_ID");
export const KAKAO_CLIENT_SECRET = requiredNonEmpty("KAKAO_CLIENT_SECRET");
export const NAVER_CLIENT_ID = requiredNonEmpty("NAVER_CLIENT_ID");
export const NAVER_CLIENT_SECRET = requiredNonEmpty("NAVER_CLIENT_SECRET");

// ================================
// AI Services (credentials are resolved from platform_credentials; endpoints stay in env)
// ================================
export const OPENAI_BASE_URL = requiredNonEmpty("OPENAI_BASE_URL");

export const ANTHROPIC_BASE_URL = requiredNonEmpty("ANTHROPIC_BASE_URL");

export const XAI_BASE_URL = requiredNonEmpty("XAI_BASE_URL");

export const DEEPSEEK_BASE_URL = optional("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1");

export const ZAI_BASE_URL = optional("ZAI_BASE_URL", "https://api.z.ai/api/paas/v4");

export const BACKGROUND_REMOVE_PROVIDER = requiredEnum({
  key: "BACKGROUND_REMOVE_PROVIDER",
  values: ["photoroom", "pixian"] as const,
  default: "photoroom",
});
export const BACKGROUND_REMOVE_FALLBACK_ENABLED = optionalBool("BACKGROUND_REMOVE_FALLBACK_ENABLED", true);
export const BACKGROUND_REMOVE_ALLOW_WATERMARKED_OUTPUT = optionalBool(
  "BACKGROUND_REMOVE_ALLOW_WATERMARKED_OUTPUT",
  false,
);

// ================================
// Toss (SECRET/STRING non-empty)
// ================================
export const TOSS_WIDGET_SECRET_KEY = requiredNonEmpty("TOSS_WIDGET_SECRET_KEY");
export const TOSS_CONFIRM_URL = requiredNonEmpty("TOSS_CONFIRM_URL");
/** 미설정 시 confirm URL에서 /confirm을 제거해 전체 취소 URL을 구성한다. */
export const TOSS_CANCEL_URL = optional("TOSS_CANCEL_URL", "");
/** 승인 후 자동 취소는 실 MID 증빙·운영 승인 후에만 명시적으로 켠다. */
export const PAYMENT_AUTO_CANCEL_ENABLED = optionalBool("PAYMENT_AUTO_CANCEL_ENABLED", false);
/** 개인 구독은 현재 판매하지 않으며, 향후 별도 상품·세무·환불 계약 승인 후에만 켠다. */
export const PERSONAL_SUBSCRIPTION_SALES_ENABLED = optionalBool("PERSONAL_SUBSCRIPTION_SALES_ENABLED", false);

// Universe wallet lifecycle
export const UNIVERSE_WALLET_CRON_SECRET = optional("UNIVERSE_WALLET_CRON_SECRET", "");

// Amazon SES (IAM Role credential chain 사용 — 정적 AWS access key/secret key 환경변수는 정의하지 않는다)
export const AWS_SES_REGION = optional("AWS_SES_REGION", "us-east-1");
export const AWS_SES_TRANSACTIONAL_IDENTITY = optional("AWS_SES_TRANSACTIONAL_IDENTITY", "mail.allmyuniverse.com");
export const AWS_SES_TRANSACTIONAL_CONFIGURATION_SET = optional(
  "AWS_SES_TRANSACTIONAL_CONFIGURATION_SET",
  "amu-transactional",
);
export const AWS_SES_NEWSLETTER_IDENTITY = optional("AWS_SES_NEWSLETTER_IDENTITY", "news.allmyuniverse.com");
export const AWS_SES_NEWSLETTER_CONFIGURATION_SET = optional(
  "AWS_SES_NEWSLETTER_CONFIGURATION_SET",
  "amu-newsletter",
);
// SNS webhook은 서명된 다른 AWS 계정의 동일 이름 topic도 거부하도록 exact ARN을 요구한다.
export const AWS_SES_TRANSACTIONAL_TOPIC_ARN = optional("AWS_SES_TRANSACTIONAL_TOPIC_ARN", "");
export const AWS_SES_NEWSLETTER_TOPIC_ARN = optional("AWS_SES_NEWSLETTER_TOPIC_ARN", "");
/** SES-240 승인 한도는 14건/초다. 기본값은 운영 여유를 둔 10건/초이며 상한을 넘길 수 없다. */
export const AWS_SES_SEND_RATE_PER_SECOND = optionalInt("AWS_SES_SEND_RATE_PER_SECOND", 10, { min: 1, max: 14 });

// SES-610 deliverability monitoring. 비율은 퍼센트(5 = 5%, 0.1 = 0.1%)이며 자동 차단은 명시적으로 켠다.
export const MAIL_DELIVERABILITY_MONITOR_ENABLED = optionalBool("MAIL_DELIVERABILITY_MONITOR_ENABLED", true);
export const MAIL_DELIVERABILITY_AUTO_BLOCK_ENABLED = optionalBool("MAIL_DELIVERABILITY_AUTO_BLOCK_ENABLED", false);
export const MAIL_DELIVERABILITY_WINDOW_MINUTES = optionalInt("MAIL_DELIVERABILITY_WINDOW_MINUTES", 60, {
  min: 1,
  max: 24 * 60,
});
export const MAIL_DELIVERABILITY_MIN_SENDS = optionalInt("MAIL_DELIVERABILITY_MIN_SENDS", 10, {
  min: 1,
  max: 1_000_000,
});
export const MAIL_DELIVERABILITY_BOUNCE_RATE_THRESHOLD = optionalNumber(
  "MAIL_DELIVERABILITY_BOUNCE_RATE_THRESHOLD",
  0,
  { min: 0, max: 100 },
);
export const MAIL_DELIVERABILITY_COMPLAINT_RATE_THRESHOLD = optionalNumber(
  "MAIL_DELIVERABILITY_COMPLAINT_RATE_THRESHOLD",
  0,
  { min: 0, max: 100 },
);
export const MAIL_DELIVERABILITY_BLOCK_MINUTES = optionalInt("MAIL_DELIVERABILITY_BLOCK_MINUTES", 60, {
  min: 1,
  max: 7 * 24 * 60,
});
export const MAIL_DELIVERABILITY_ALERT_WEBHOOK_URL = optional("MAIL_DELIVERABILITY_ALERT_WEBHOOK_URL", "");

// SES-630 발송량·비용 모니터링. 비용은 AWS 청구액이 아닌 SES recipient 기준 추정치다.
export const MAIL_VOLUME_MONITOR_ENABLED = optionalBool("MAIL_VOLUME_MONITOR_ENABLED", true);
export const MAIL_VOLUME_COST_PER_1000_USD = optionalNumber("MAIL_VOLUME_COST_PER_1000_USD", 0.16, {
  min: 0,
  max: 100,
});
export const MAIL_VOLUME_DAILY_SEND_ALERT_THRESHOLD = optionalInt("MAIL_VOLUME_DAILY_SEND_ALERT_THRESHOLD", 1000, {
  min: 0,
  max: 10_000_000,
});
export const MAIL_VOLUME_ALERT_SPIKE_MULTIPLIER = optionalNumber("MAIL_VOLUME_ALERT_SPIKE_MULTIPLIER", 3, {
  min: 1,
  max: 100,
});
export const MAIL_VOLUME_ALERT_MIN_SENDS = optionalInt("MAIL_VOLUME_ALERT_MIN_SENDS", 10, {
  min: 1,
  max: 10_000_000,
});
export const MAIL_VOLUME_ALERT_WEBHOOK_URL = optional("MAIL_VOLUME_ALERT_WEBHOOK_URL", "");

// 뉴스레터 구독·동의 흐름은 법무 계약과 공개 발송 승인 후에만 켠다. 기본값은 전면 차단이다.
export const NEWSLETTER_SUBSCRIPTION_ENABLED = optionalBool("NEWSLETTER_SUBSCRIPTION_ENABLED", false);
/** 뉴스레터 campaign 승인·테스트 발송 경로. 운영 전환 전까지 기본값은 전면 차단이다. */
export const NEWSLETTER_CAMPAIGN_ENABLED = optionalBool("NEWSLETTER_CAMPAIGN_ENABLED", false);
/** 테스트 발송은 사전 등록된 운영자 자기 주소 하나로만 제한한다. */
export const NEWSLETTER_TEST_RECIPIENT_EMAIL = optional("NEWSLETTER_TEST_RECIPIENT_EMAIL", "");
export const NEWSLETTER_CONSENT_VERSION = requiredEnum({
  key: "NEWSLETTER_CONSENT_VERSION",
  values: ["newsletter-consent-v1.0.0"] as const,
  default: "newsletter-consent-v1.0.0",
});
export const NEWSLETTER_CONFIRMATION_TOKEN_TTL_MINUTES = optionalInt(
  "NEWSLETTER_CONFIRMATION_TOKEN_TTL_MINUTES",
  24 * 60,
  { min: 24 * 60, max: 24 * 60 },
);

// ================================
// Email verification (SES-440)
// ================================
/** 신규 이메일 가입 필수 소유권 인증 feature flag. 기본 off이며 법무·migration 승인 후 on한다. */
export const EMAIL_VERIFICATION_REQUIRED = optionalBool("EMAIL_VERIFICATION_REQUIRED", false);

// ================================
// Crypto key (SECRET non-empty)
// ================================
export const CREDENTIALS_KMS_KEY = requiredNonEmpty("CREDENTIALS_KMS_KEY");

// ================================
// Private Trade Lab (LIST — 미설정이면 전원 차단)
// ================================
// 소유자 허용목록. administrator 역할은 통과 조건이 아니다 — "관리자 AND 허용목록"이 아니라 "허용목록만" 검사한다.
// 미설정을 "제한 없음"으로 해석하면 배포 실수 한 번이 곧 전면 개방이 되므로, 빈 목록은 전원 차단으로 둔다(fail-closed).
export const PRIVATE_TRADING_OWNER_UIDS = optionalCsv("PRIVATE_TRADING_OWNER_UIDS");

// ================================
// 유예 결과 고지 (빌드 단계 전용)
// ================================
// 검증을 조용히 건너뛰면 "빌드는 됐는데 런타임에 죽는" 상황의 원인을 찾기 어렵다.
// 다만 이 모듈은 page data 수집 워커마다 평가되므로 전체 목록을 매번 찍으면 빌드 로그를 뒤덮는다.
// 기본은 1줄 요약만 남기고, 목록이 필요하면 AMU_ENV_DEBUG=1로 켠다.
if (IS_ENV_VALIDATION_DEFERRED && DEFERRED_ENV_KEYS.size > 0) {
  const detail =
    process.env.AMU_ENV_DEBUG === "1"
      ? ` — ${Array.from(DEFERRED_ENV_KEYS).sort().join(", ")}`
      : " (목록은 AMU_ENV_DEBUG=1)";
  console.warn(
    `[env] 빌드 단계: 미설정 필수 서버 env ${DEFERRED_ENV_KEYS.size}개 검증 유예. 런타임에서 재검증됩니다${detail}`,
  );
}
