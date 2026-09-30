import "server-only";
import { redisCache } from "libs/cache/redisCacheService";
import bcrypt from "bcryptjs";
import { logger } from "utils/log";
import crypto from "crypto";
import { NAVER_COMMERCE_BASE } from "consts/thirdparty/naver";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process getNaverAccessToken 중심 처리  입력 검증  핵심 로직  결과 포맷팅
 * @domain thirdparty
 * @scope server
 */

const BASE = NAVER_COMMERCE_BASE;
const SAFETY = 60_000; // 만료 60초 전 갱신
const SECRET_PATTERN = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{22}$/;

export type NaverAppCredentials = {
  applicationId: string;
  applicationSecret: string;
  cacheScope?: string; // 유니버스/테넌트/관리자아이디 등 범위 구분자
  // 커머스솔루션(멀티 셀러) 지원: 기본은 SELF(자체 스토어) 유지
  tokenType?: "SELF" | "SELLER";
  accountId?: string; // tokenType === "SELLER"일 때 판매자 account_id (커머스ID 인증 JWE에서 획득)
};

type TokenCache = { token: string; expireAt: number };

function normalizeCredentials(creds: NaverAppCredentials): NaverAppCredentials {
  const tokenType = creds.tokenType === "SELLER" ? "SELLER" : "SELF";
  return {
    applicationId: String(creds.applicationId || "").trim(),
    applicationSecret: String(creds.applicationSecret || "").trim(),
    cacheScope: String(creds.cacheScope || "global").trim() || "global",
    tokenType,
    accountId: tokenType === "SELLER" ? String(creds.accountId || "").trim() : undefined,
  };
}

function buildRedisKey(creds: NaverAppCredentials): string {
  // 자격증명 + 스코프 기반 키
  const scope = creds.cacheScope || "global";
  // SELLER 모드는 셀러(account_id)별로 토큰이 분리되어야 함 (공용 app 공유 시 크로스테넌트 방지)
  const tokenType = creds.tokenType || "SELF";
  const account = creds.accountId ? `|acc:${creds.accountId}` : "";
  const h = crypto
    .createHash("sha256")
    .update(`${scope}|${tokenType}|${creds.applicationId}|${creds.applicationSecret}${account}`)
    .digest("hex")
    .slice(0, 24);
  return `naver:commerce:access_token:${h}`;
}

async function issueToken(creds: NaverAppCredentials): Promise<TokenCache> {
  const APP_ID = creds.applicationId?.trim();
  const APP_SECRET = creds.applicationSecret?.trim();
  const tokenType = creds.tokenType || "SELF";
  const accountId = creds.accountId?.trim();

  if (!APP_ID || !APP_SECRET) {
    throw new Error("NAVER APP_ID/APP_SECRET 미설정(관리자 자격증명 필요)");
  }
  if (!SECRET_PATTERN.test(APP_SECRET)) {
    logger.error("[NaverToken] SECRET 형식 오류: bcrypt salt($2a$...)가 아님");
    throw new Error("NAVER_COMMERCE_APPLICATION_SECRET 형식 오류($2a$.. 필요)");
  }
  if (tokenType === "SELLER" && !accountId) {
    throw new Error("NAVER SELLER 토큰 발급에는 account_id가 필요합니다.");
  }

  const timestamp = Date.now();
  const password = `${APP_ID}_${timestamp}`;
  const hashed = bcrypt.hashSync(password, APP_SECRET); // salt = bcrypt salt
  const clientSecretSign = Buffer.from(hashed, "utf-8").toString("base64");

  const form = new URLSearchParams({
    client_id: APP_ID,
    client_secret_sign: clientSecretSign,
    grant_type: "client_credentials",
    timestamp: String(timestamp),
    type: tokenType,
  });
  // SELLER 모드에서만 account_id 첨부 (SELF 요청 형태는 기존과 100% 동일 유지)
  if (tokenType === "SELLER" && accountId) {
    form.set("account_id", accountId);
  }

  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });

  const traceId = res.headers.get("GNCP-GW-Trace-ID") || "";
  if (!res.ok) {
    await res.arrayBuffer().catch(() => undefined);
    logger.error("[NaverToken] issue failed", { status: res.status, traceId });
    throw new Error(`NAVER 토큰 발급 실패 (${res.status})`);
  }

  const data = await res.json(); // { access_token, expires_in, ... }
  if (!data.access_token) throw new Error("NAVER 토큰 응답에 access_token이 없습니다.");
  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  return { token: data.access_token, expireAt: Date.now() + ttlMs - SAFETY };
}

export async function getNaverAccessToken(creds: NaverAppCredentials): Promise<string> {
  const normalized = normalizeCredentials(creds);
  const key = buildRedisKey(normalized);

  // 1) Redis 캐시 우선
  const cached = await redisCache.get<TokenCache>(key);
  if (cached && cached.expireAt > Date.now()) return cached.token;

  // 2) 발급 후 Redis 저장
  const fresh = await issueToken(normalized);
  const ttlSec = Math.max(30, Math.floor((fresh.expireAt - Date.now()) / 1000));
  await redisCache.set(key, fresh, ttlSec);
  return fresh.token;
}

export async function invalidateNaverToken(creds: NaverAppCredentials) {
  const key = buildRedisKey(normalizeCredentials(creds));
  await redisCache.del(key);
}
