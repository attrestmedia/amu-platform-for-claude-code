/**
 * env.client.ts
 * - 브라우저 번들에서 안전하게 사용 가능한 NEXT_PUBLIC_ 계열 환경 변수
 * - Next 빌드 치환 대상은 반드시 정적으로 접근
 */

const requiredEnv = (v: string | undefined, key: string) => {
  if (!v) throw new Error(`[env] Missing required public env: ${key}`);
  return v;
};

export const PUBLIC_ENV = {
  WP_HOME_URL: requiredEnv(process.env.NEXT_PUBLIC_WP_HOME_URL, "NEXT_PUBLIC_WP_HOME_URL"),
  DEFAULT_API_URL: requiredEnv(process.env.NEXT_PUBLIC_API_URL, "NEXT_PUBLIC_API_URL"),
  TOSS_WIDGET_CLIENT_KEY: requiredEnv(
    process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY,
    "NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY",
  ),
  TOSS_SUCCESS_PATH: requiredEnv(process.env.NEXT_PUBLIC_TOSS_SUCCESS_PATH, "NEXT_PUBLIC_TOSS_SUCCESS_PATH"),
  TOSS_FAIL_PATH: requiredEnv(process.env.NEXT_PUBLIC_TOSS_FAIL_PATH, "NEXT_PUBLIC_TOSS_FAIL_PATH"),
} as const;

export const WP_HOME_URL = PUBLIC_ENV.WP_HOME_URL;
export const DEFAULT_API_URL = PUBLIC_ENV.DEFAULT_API_URL;

export const TOSS_WIDGET_CLIENT_KEY = PUBLIC_ENV.TOSS_WIDGET_CLIENT_KEY;
export const TOSS_SUCCESS_PATH = PUBLIC_ENV.TOSS_SUCCESS_PATH;
export const TOSS_FAIL_PATH = PUBLIC_ENV.TOSS_FAIL_PATH;
