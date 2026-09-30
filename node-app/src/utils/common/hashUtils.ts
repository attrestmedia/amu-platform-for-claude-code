import type { AiMessageType, AiMessageBaseType } from "types/ai";

/**
 * @docHint
 * @purpose hashUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain utils
 * @scope shared
 */

// 유니코드 안전한 해시 생성 함수
export const createTextHash = (text: string): string => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32비트 정수로 변환
  }
  return Math.abs(hash).toString(36).substring(0, 8);
};

export async function createSha256Hex(text: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("crypto_subtle_unavailable");
  }

  const bytes = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// 유일한 메시지용 아이디 생성
export const uniqueMsgId = (kind: AiMessageType = "assistant", msg = "") => {
  let suf = "";
  try {
    const a = new Uint32Array(1);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(a);
      suf = "-" + a[0].toString(36).slice(-4);
    }
  } catch {}
  return `msg-${kind}-${Date.now().toString(36)}-${createTextHash(msg)}${suf}`;
};

// 내용=타임스탬프-역할-인덱스 기반 결정적 아이디 생성
export const stableMsgId = (role: AiMessageBaseType, timestamp: Date | string | number, content: string, index = 0) => {
  const millis =
    timestamp instanceof Date
      ? timestamp.getTime()
      : Number.isFinite(+timestamp)
      ? +timestamp
      : Date.parse(String(timestamp)) || 0;
  const keyBase = `${role}|${millis}|${createTextHash(content)}|${index}`;
  return `msg-${createTextHash(keyBase).slice(0, 8)}`;
};

let runtimeUniqueIdCounter = 0;
const runtimeUniqueIdSeed = Math.random().toString(36).slice(2, 10);

const createRuntimeUniqueSuffix = (): string => {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  runtimeUniqueIdCounter = (runtimeUniqueIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  const sequence = runtimeUniqueIdCounter.toString(36);

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}-${sequence}`;
  }

  // 충돌 판정용 런타임 ID이며 보안 토큰으로 사용하지 않는다.
  const time = Date.now().toString(36);
  const monotonicTime =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? Math.floor(performance.now() * 1000).toString(36)
      : "0";
  return `${time}-${monotonicTime}-${runtimeUniqueIdSeed}-${sequence}`;
};

// 보안 컨텍스트가 아닌 로컬 HTTP 브라우저에서도 동작하는 유니크 아이디 생성기
export const genUniqueId = (prefix: string) => `${prefix}-${createRuntimeUniqueSuffix()}`;
