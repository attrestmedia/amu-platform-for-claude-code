import type { RouteHintType } from "types/ai";
import { GUEST_ID_KEY } from "consts/token";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose normalizeUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain auth
 * @scope shared
 */

// -로 연결된 일관된 문자열 생성
export function normalizeKey(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// history stringify 안전화
// - 과도한 비용 방지: depth/keys/items 제한 후 짧게 stringify
function safeStringifyForHistory(value: unknown, maxLen: number) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();

  // 최대한 안정적으로 "짧은 프리뷰"로 변환
  const MAX_DEPTH = 3;
  const MAX_KEYS = 30;
  const MAX_ARRAY = 30;

  const seen = typeof WeakSet !== "undefined" ? new WeakSet<object>() : null;

  const prune = (v: unknown, depth: number): unknown => {
    if (v == null) return v;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (t === "bigint") return v.toString();
    if (t === "symbol") return String(v);
    if (t === "function") return "[Function]";

    // Date / Error
    try {
      if (v instanceof Date) return v.toISOString();
      if (v instanceof Error) return { name: v.name, message: v.message };
    } catch {}

    if (depth <= 0) {
      // 깊이 제한에 걸리면 형태만 남김
      if (Array.isArray(v)) return `[Array(${v.length})]`;
      return "[Object]";
    }

    if (Array.isArray(v)) {
      const out: unknown[] = [];
      const len = Math.min(v.length, MAX_ARRAY);
      for (let i = 0; i < len; i++) out.push(prune(v[i], depth - 1));
      if (v.length > len) out.push(`[...${v.length - len} more]`);
      return out;
    }

    if (t === "object") {
      if (seen) {
        try {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        } catch {}
      }

      const out: Record<string, unknown> = {};
      let count = 0;

      // Object.keys가 Proxy/Getter에서 문제낼 수 있어 방어적으로 접근
      let keys: string[] = [];
      try {
        keys = Object.keys(v);
      } catch {
        // 최후 fallback: 문자열로
        return "[UnserializableObject]";
      }

      for (const k of keys) {
        out[k] = prune(toUnknownRecord(v)[k], depth - 1);
        count++;
        if (count >= MAX_KEYS) {
          out.__more__ = `+${Math.max(0, keys.length - count)} keys`;
          break;
        }
      }
      return out;
    }

    // 기타 타입
    try {
      return String(v);
    } catch {
      return "";
    }
  };

  try {
    const pruned = prune(value, MAX_DEPTH);
    const json = JSON.stringify(pruned);
    const s = typeof json === "string" ? json : String(pruned);
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  } catch {
    try {
      const s = String(value);
      return s.length > maxLen ? s.slice(0, maxLen) : s;
    } catch {
      return "";
    }
  }
}

// 공통 history 정규화
export function normalizeHistory(history: unknown, maxMessages: number, perMessageCharCap = 20000) {
  if (!Array.isArray(history) || history.length === 0) return [];

  const sliced = history.slice(-Math.max(1, maxMessages));

  return sliced
    .filter((m) => {
      const item = toUnknownRecord(m);
      return item.role === "user" || item.role === "assistant";
    })
    .map((m) => {
      const item = toUnknownRecord(m);
      const raw = item.content;
      const content = safeStringifyForHistory(raw, perMessageCharCap);

      return { role: item.role as "user" | "assistant", content: content.slice(0, perMessageCharCap) };
    });
}

// 라우트힌트 정규화
export function normalizeRouteHint(v: unknown): RouteHintType {
  return v === "commerce" || v === "tutors" ? v : "ai";
}

// 게스트ID 보장 헬퍼
export function ensureGuestId(existing?: string): string | undefined {
  const incoming = typeof existing === "string" ? existing.trim() : "";

  const setGuestIdCookie = (key: string, id: string) => {
    const secure = window.location?.protocol === "https:" ? "; Secure" : "";
    return `${key}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  };

  const ensureCookieSynced = (id: string) => {
    try {
      if (typeof document === "undefined") return;
      const encoded = encodeURIComponent(id);
      // cookie 문자열은 인코딩된 값이 들어가므로 encoded 기준으로 검사
      if (!document.cookie.includes(`${GUEST_ID_KEY}=${encoded}`)) {
        document.cookie = setGuestIdCookie(GUEST_ID_KEY, id);
      }
    } catch {}
  };

  // existing이 들어오면 "그 값을" 저장소에 동기화
  // - 서버 헤더 등에서 받은 값도 포함
  if (incoming) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(GUEST_ID_KEY, incoming);
        // middleware가 읽는 cookie(amu_guest_id)도 같이 세팅하여 헤더 누락 방지
        if (typeof document !== "undefined") {
          document.cookie = setGuestIdCookie(GUEST_ID_KEY, incoming);
        }
      }
    } catch {}
    return incoming;
  }

  try {
    if (typeof window !== "undefined") {
      let gid = window.localStorage.getItem(GUEST_ID_KEY);
      if (!gid) {
        // 가능하면 더 안전/고유한 방식 우선
        const uuid =
          typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `r${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
        gid = `gid_${uuid}`;
        window.localStorage.setItem(GUEST_ID_KEY, gid);
        if (typeof document !== "undefined") {
          document.cookie = setGuestIdCookie(GUEST_ID_KEY, gid);
        }
      }
      // localStorage에는 있지만 cookie가 빈 경우 보정
      if (gid) ensureCookieSynced(gid);
      return gid;
    }
  } catch {}
  return existing;
}

// 바이트를 사람이 읽기 쉬운 형태로 변환
export function formatBytes(bytes: number, decimals: number = 0): string {
  if (bytes === 0) return "0B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))}${sizes[i]}`;
}

// 정규식 표현 제거
export function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
