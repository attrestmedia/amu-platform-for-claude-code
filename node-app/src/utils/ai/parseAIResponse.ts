import { logger } from "../log";
import type { SystemCodeType } from "types/ai";
import { SYSTEM_CODES } from "consts/ai";
import { toUnknownRecord, pickArray } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose parseAIResponse 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope shared
 */

type Parsed = {
  isValid: boolean;
  message: string;
  systemCode?: SystemCodeType[];
  translation?: string;
  productCode?: string[];
};

const toArray = (v: unknown) => (Array.isArray(v) ? v : v != null ? [v] : []);

// 한글/유니코드 코드 허용
const sanitizeProductCode = (v: unknown) => {
  if (v == null) return null;
  const s = String(v).trim();
  // 문자/숫자 + _, -, :, . 만 허용 (유니코드 레터 포함)
  return /^[\p{L}\p{N}_\-:.]+$/u.test(s) ? s : null;
};

// 유효한 SystemCodeType인지 검증하는 타입 가드
export const isValidSystemCode = (v: string): v is SystemCodeType => {
  return (SYSTEM_CODES as readonly string[]).includes(v);
};

export function parseAIResponse(raw: string): Parsed {
  if (typeof raw !== "string") return { isValid: false, message: "" };

  logger.log("[parseAIResponse] raw:", raw);

  // 1) 코드펜스 우선 걷어내기
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;

  // 2) 문장 속 첫 JSON 오브젝트만 뽑기
  const onlyJson = extractFirstJsonObject(candidate) || candidate;

  // 3) 파싱 1차 시도
  let obj: unknown = tryParseJSON(onlyJson);

  // 4) 실패하면 보정 후 재시도
  if (!obj) {
    const repaired = repairJsonLikeString(onlyJson);
    obj = tryParseJSON(repaired);
  }

  // 5) 여전히 실패면 러프 추출로 최소 필드만 확보
  if (!obj) {
    const rough = roughPick(candidate);
    if (!rough) return { isValid: false, message: raw };
    const systemCode = toArray(rough.systemCode).filter(Boolean) as SystemCodeType[];
    return {
      isValid: false,
      message: rough.message || raw,
      translation: rough.translation,
      systemCode: systemCode.length ? systemCode : undefined,
      productCode: undefined, // 러프 단계에선 보통 못 뽑음
    };
  }

  // 6) 필드 정규화 (productCode 다양한 키 케이스 허용)
  const objRec = toUnknownRecord(obj);
  const message =
    typeof objRec.message === "string"
      ? objRec.message
      : typeof objRec.content === "string"
        ? objRec.content
        : typeof objRec.text === "string"
          ? objRec.text
          : "";
  const systemCode = toArray(objRec.systemCode)
    .map((v) => String(v).trim())
    .filter((v): v is SystemCodeType => Boolean(v) && isValidSystemCode(v));

  const productsRaw = pickArray<unknown>(objRec.products).map((p) => {
    const r = toUnknownRecord(p);
    return r.code ?? r.id ?? r.sku;
  });
  const productCodesRaw = objRec.productCode ?? objRec.productCodes ?? productsRaw;

  const productCode = Array.from(new Set(toArray(productCodesRaw).map(sanitizeProductCode).filter(Boolean))).slice(
    0,
    20,
  ) as string[];

  const translation =
    typeof objRec.translation === "string"
      ? objRec.translation
      : typeof objRec.translated === "string"
        ? objRec.translated
        : undefined;

  return {
    isValid: true,
    message,
    systemCode: systemCode.length ? systemCode : undefined,
    translation,
    productCode: productCode.length ? productCode : undefined,
  };
}

/* =========================
 * 내부 헬퍼 함수들
 * ========================= */

/** JSON.parse 래퍼 (실패시 null) */
function tryParseJSON(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 코드블록/설명 텍스트가 섞였을 때, 최초의 JSON 오브젝트만 정확히 잘라내는 함수
 * - 문자열 내부의 중괄호는 무시 (따옴표 상태 추적)
 */
function extractFirstJsonObject(s: string): string | null {
  let start = -1;
  let depth = 0;
  let inStr: '"' | "'" | null = null;
  let esc = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    // 문자열 토글/이스케이프 처리
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === inStr) {
        inStr = null;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inStr = ch as '"' | "'";
      } else if (ch === "{") {
        if (start === -1) start = i;
        depth++;
      } else if (ch === "}") {
        if (depth > 0) depth--;
        if (depth === 0 && start !== -1) {
          return s.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * JSON 비슷한 문자열을 간단 보정:
 *  - 키에 큰따옴표 강제
 *  - 값에 작은따옴표 사용 시 큰따옴표로 치환
 *  - 트레일링 콤마 제거
 *  - BOM/제어문자 제거
 */
function repairJsonLikeString(s: string): string {
  let t = s.replace(/^\uFEFF/, ""); // BOM 제거

  // 키에 큰따옴표 추가: { key: ... } -> { "key": ... }
  t = t.replace(/([{,]\s*)'([^'"]+)'\s*:/g, '$1"$2":').replace(/([{,]\s*)([A-Za-z0-9_$]+)\s*:/g, '$1"$2":');

  // 값에 작은따옴표 사용 시 큰따옴표로 (보수적 적용)
  t = t.replace(/:\s*'([^']*)'/g, ': "$1"');

  // 트레일링 콤마 제거
  t = t.replace(/,\s*([}\]])/g, "$1");

  return t;
}

/** 최후 보루: 정규식으로 주요 필드만 추출 (중첩 허용) */
function roughPick(s: string): { message?: string; translation?: string; systemCode?: SystemCodeType[] } | null {
  // response 래퍼 안쪽까지 탐색
  const scope = (() => {
    const m = s.match(/"response"\s*:\s*({[\s\S]*})/);
    return m ? m[1] : s;
  })();

  const messageMatch = scope.match(/"message"\s*:\s*"([\s\S]*?)"/);
  const translationMatch = scope.match(/"translation"\s*:\s*"([\s\S]*?)"/);
  const systemCodeBlock = scope.match(/"systemCode"\s*:\s*(\[[\s\S]*?\]|"[^"]*")/);

  let systemCode: SystemCodeType[] | undefined;
  if (systemCodeBlock) {
    const raw = systemCodeBlock[1].trim();
    if (raw.startsWith("[")) {
      const items = raw.match(/"([\s\S]*?)"/g) || [];
      const filtered = items
        .map((v) => v.replace(/^"|"$/g, ""))
        .filter((v): v is SystemCodeType => isValidSystemCode(v));
      systemCode = filtered.length ? filtered : undefined;
    } else {
      const single = raw.replace(/^"|"$/g, "");
      systemCode = isValidSystemCode(single) ? [single] : undefined;
    }
  }

  if (messageMatch || translationMatch || systemCode) {
    return {
      message: messageMatch ? messageMatch[1] : undefined,
      translation: translationMatch ? translationMatch[1] : undefined,
      systemCode,
    };
  }
  return null;
}
