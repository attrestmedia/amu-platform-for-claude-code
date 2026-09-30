import "server-only";

import {
  KNOWLEDGE_CANONICAL_HOSTS,
  KNOWLEDGE_LIMITS,
} from "./magazineKnowledgeContract";

/**
 * @docHint
 * @purpose Knowledge Corpus 계약의 입력 안전성 primitive — 폐기한 article-intelligence.v1 헬퍼의 이식분
 * @process 안전 문자열·식별자·키 allowlist·참조 scheme·canonical 호스트를 fail-closed로 판정
 * @domain magazine-knowledge-corpus
 * @scope server-contract
 */

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+ Z-]+)?$/;
/** 시점 주장의 정밀도는 자료가 정한다 — 연도만 아는 역사적 주장(전망이론 1979 등)에 월을 지어내지 않는다. */
export const MONTH_OR_DATE_PATTERN = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
export const REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 :._+-]{0,63}$/;
/** HTML·실행 payload·credential·식별 가능한 이메일 차단 (원본 articleIntelligenceSafeText 그대로) */
const UNSAFE_TEXT_PATTERN = /<[^>]+>|javascript:|data:|vbscript:|(?:^|\s)Bearer\s+[A-Za-z0-9._-]+|(?:^|\s)sk-[A-Za-z0-9]/i;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const ALLOWED_SOURCE_SCHEMES = ["http", "https", "urn", "doi", "amu"];

export class MagazineKnowledgeContractError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "MagazineKnowledgeContractError";
    this.field = field;
  }
}

export function fail(field: string, message: string): never {
  throw new MagazineKnowledgeContractError(field, message);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeText(value: unknown, max: number, field: string, allowEmpty = false): string {
  if (typeof value !== "string") fail(field, "문자열이 필요합니다.");
  const trimmed = value.trim();
  if (!trimmed && allowEmpty) return "";
  if (!trimmed || Array.from(trimmed).length > max) fail(field, `길이가 1~${max}자여야 합니다.`);
  if (UNSAFE_TEXT_PATTERN.test(trimmed) || CONTROL_CHAR_PATTERN.test(trimmed) || EMAIL_PATTERN.test(trimmed)) {
    fail(field, "HTML, 실행 가능한 payload, credential 또는 식별 가능한 이메일을 포함할 수 없습니다.");
  }
  return trimmed;
}

export function identifier(value: unknown, field: string, slug = false): string {
  if (typeof value !== "string") fail(field, "식별자 문자열이 필요합니다.");
  const trimmed = value.trim();
  const pattern = slug ? SLUG_PATTERN : IDENTIFIER_PATTERN;
  if (!trimmed || Array.from(trimmed).length > KNOWLEDGE_LIMITS.identifierLength || !pattern.test(trimmed)) {
    fail(field, "허용된 식별자 형식이 아닙니다.");
  }
  return trimmed;
}

export function assertKeys(value: Record<string, unknown>, required: string[], allowed: string[], field: string): void {
  const keys = Object.keys(value);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.includes(key))) {
    fail(field, `필수 필드 또는 허용되지 않은 필드가 있습니다. 허용: ${allowed.join(", ")}`);
  }
}

export function enumValue<T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) fail(field, `허용된 값이 아닙니다: ${values.join(" | ")}`);
  return value as T[number];
}

export function textList(value: unknown, field: string, maxItems: number = KNOWLEDGE_LIMITS.textListItems, maxLength: number = KNOWLEDGE_LIMITS.textListLength): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(field, `문자열 목록은 ${maxItems}개 이하여야 합니다.`);
  return value.map((item, index) => safeText(item, maxLength, `${field}[${index}]`));
}

export function refList(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail(field, `참조 목록은 ${maxItems}개 이하여야 합니다.`);
  const refs = value.map((item, index) => identifier(item, `${field}[${index}]`));
  if (new Set(refs).size !== refs.length) fail(field, "중복 참조를 포함할 수 없습니다.");
  return refs;
}

export function sourceRef(value: unknown, field: string): string {
  const parsed = safeText(value, KNOWLEDGE_LIMITS.sourceRefLength, field);
  const scheme = parsed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || !ALLOWED_SOURCE_SCHEMES.includes(scheme)) {
    fail(field, "http(s) URL 또는 승인된 opaque reference가 필요합니다.");
  }
  if (scheme === "http" || scheme === "https") {
    try {
      const url = new URL(parsed);
      if (!url.hostname || url.username || url.password) throw new Error("unsafe");
    } catch {
      fail(field, "안전한 http(s) URL이 필요합니다.");
    }
  }
  return parsed;
}

export function canonicalUrl(value: unknown, field: string): string {
  const parsed = safeText(value, 480, field);
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    return fail(field, "절대 URL이 필요합니다.");
  }
  if (url.protocol !== "https:" || url.username || url.password) fail(field, "자격증명 없는 https URL이 필요합니다.");
  if (!(KNOWLEDGE_CANONICAL_HOSTS as readonly string[]).includes(url.hostname)) {
    fail(field, `canonical 호스트는 ${KNOWLEDGE_CANONICAL_HOSTS.join(" | ")} 중 하나여야 합니다.`);
  }
  return parsed;
}
