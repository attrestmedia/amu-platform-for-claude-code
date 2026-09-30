/**
 * env.runtime.ts
 * - 클라이언트/서버 공통 사용 변수
 * layout.tsx가 beforeInteractive로 window.__AMU_RUNTIME_ENV__에 주입
 */

type RuntimeEnv = {
  SITE_DOMAIN: string;
  WP_API_URL: string;
  WP_AUTH_URL: string;
  WP_ME_URL: string;
};

declare global {
  interface Window {
    __AMU_RUNTIME_ENV__?: Partial<RuntimeEnv>;
  }
}

function requiredEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`[env] Missing required server env: ${key}`);
  }
  return v;
}

function requiredInjected(v: unknown, key: keyof RuntimeEnv): string {
  const s = String(v ?? "");
  if (!s) throw new Error(`[env] Missing injected runtime env: ${String(key)}`);
  return s;
}

export function getRuntimeEnv(): RuntimeEnv {
  if (typeof window === "undefined") {
    // 서버 런타임 env
    return {
      SITE_DOMAIN: requiredEnv("SITE_DOMAIN"),
      WP_API_URL: requiredEnv("WP_API_URL"),
      WP_AUTH_URL: requiredEnv("WP_AUTH_URL"),
      WP_ME_URL: requiredEnv("WP_ME_URL"),
    };
  }

  const injected = window.__AMU_RUNTIME_ENV__ || {};
  return {
    SITE_DOMAIN: requiredInjected(injected.SITE_DOMAIN, "SITE_DOMAIN"),
    WP_API_URL: requiredInjected(injected.WP_API_URL, "WP_API_URL"),
    WP_AUTH_URL: requiredInjected(injected.WP_AUTH_URL, "WP_AUTH_URL"),
    WP_ME_URL: requiredInjected(injected.WP_ME_URL, "WP_ME_URL"),
  };
}

let _cached: RuntimeEnv | null = null;
function getRuntimeEnvCached(): RuntimeEnv {
  if (_cached) return _cached;
  _cached = getRuntimeEnv();
  return _cached;
}
export const siteDomain = () => getRuntimeEnvCached().SITE_DOMAIN;
export const wpApiUri = () => getRuntimeEnvCached().WP_API_URL;
export const wpAuthUri = () => getRuntimeEnvCached().WP_AUTH_URL;
export const wpMeUri = () => getRuntimeEnvCached().WP_ME_URL;
