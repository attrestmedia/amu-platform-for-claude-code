import "server-only";
import {
  ALLOWED_IMAGE_DOMAINS,
  DEV_ADDITIONAL_DOMAINS,
  ENABLE_IMAGE_PROXY,
  IMAGE_PROXY_CACHE_TTL,
  IMAGE_PROXY_MAX_SIZE,
  COMMERCE_IMAGE_QUALITY,
  COMMERCE_IMAGE_MAX_SIZE,
  STRICT_DOMAIN_VALIDATION,
} from "consts/env/server";
import { COMMERCE_PLACEHOLDER_IMAGE } from "consts/app";
import { isDev, isProduct } from "../../../utils/common/compare";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 서버 유틸/핸들러 핵심 처리
 * @process 입력 검증  비즈니스 로직 수행  결과 포맷팅
 * @domain security
 * @scope server
 */

const stripPort = (s: string) => s.split(":")[0]?.trim();

const normHost = (s: string) => stripPort(s.trim()).toLowerCase();
const getConfiguredHost = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

const R2_PUBLIC_ASSET_HOST = getConfiguredHost(String(process.env.R2_PUBLIC_BASE_URL || "").trim());
const WP_PUBLIC_SITE_HOST = getConfiguredHost(
  String(process.env.WP_HOME_URL || process.env.NEXT_PUBLIC_WP_HOME_URL || "").trim(),
);
const RAW_ALLOWED = [...ALLOWED_IMAGE_DOMAINS, R2_PUBLIC_ASSET_HOST, WP_PUBLIC_SITE_HOST].map(normHost).filter(Boolean);
const RAW_DEV = DEV_ADDITIONAL_DOMAINS.map(normHost).filter(Boolean);

// 도메인 정합성 체크
const isValidDomain = (domain: string) => {
  const re = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
  if (domain.length === 0 || domain.length > 253) return false;
  if (!re.test(domain)) return false;
  return domain.split(".").every((label) => label.length > 0 && label.length <= 63);
};

// 모듈 로드시 1회 파싱 & 캐싱
const BASE_ALLOWED = RAW_ALLOWED.filter(isValidDomain);

// 개발 환경이면 추가
const FINAL_ALLOWED = isDev ? Array.from(new Set([...BASE_ALLOWED, ...RAW_DEV.filter(isValidDomain)])) : BASE_ALLOWED;

if (!isProduct) {
  if (FINAL_ALLOWED.length === 0) {
    logger.warn("허용 도메인 목록이 비어 있습니다. 기본값을 사용합니다.");
  } else {
    logger.info(`허용된 이미지 도메인(${FINAL_ALLOWED.length}):`, FINAL_ALLOWED);
  }
}

export const isDomainAllowed = (urlOrHost: string, allowed = FINAL_ALLOWED): boolean => {
  try {
    const hostname = (/^https?:\/\//i.test(urlOrHost) ? new URL(urlOrHost).hostname : urlOrHost).toLowerCase();
    return allowed.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch (e) {
    logger.warn(`도메인 검사 오류: ${urlOrHost}`, e);
    return false;
  }
};

export const getImageProxyConfig = () => ({
  enabled: ENABLE_IMAGE_PROXY,
  cacheTTL: IMAGE_PROXY_CACHE_TTL,
  maxSize: IMAGE_PROXY_MAX_SIZE,
  placeholderImage: COMMERCE_PLACEHOLDER_IMAGE,
  imageQuality: COMMERCE_IMAGE_QUALITY,
  maxImageSize: COMMERCE_IMAGE_MAX_SIZE,
  strictValidation: STRICT_DOMAIN_VALIDATION,
});

export const isHttpOrHttps = (u: URL | string) => {
  try {
    const url = typeof u === "string" ? new URL(u) : u;
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
