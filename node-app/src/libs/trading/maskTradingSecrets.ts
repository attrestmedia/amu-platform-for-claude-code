/**
 * @docHint
 * @purpose Private Trade Lab — 로그·AI 프롬프트에서 자격증명·계좌·잔고를 가린다
 * @process 키 이름 기반 마스킹  값 패턴 기반 마스킹  프롬프트 배제 검사
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_094830__private-trade-lab-implementation-roadmap.md §2.1
 *
 * **첫 거래소 호출 전에 만든다.** 계좌번호·잔고·API 키가 로그나 AI 컨텍스트에 찍히기 시작하면
 * 사후에 걷어내기 어렵다. 로그는 이미 수집·보관된 뒤라 지울 대상을 특정할 수 없고,
 * 프롬프트는 외부 모델 제공자에게 이미 전송된 뒤다.
 */

export const TRADING_MASK = "***";
const MAX_DEPTH = 12;

/** 통째로 가린다 — 값의 일부만 남겨도 재사용 가능한 것들 */
export const TRADING_SECRET_KEYS = [
  "accesskey",
  "secretkey",
  "apikey",
  "clientid",
  "clientsecret",
  "authorization",
  "accesstoken",
  "refreshtoken",
  "jwt",
  "signature",
  "nonce",
  "queryhash",
  "credential",
  "credentials",
  "password",
  "privatekey",
] as const;

/** 금액·수량 — 잔고가 로그에 남으면 그 자체로 자산 규모가 노출된다 */
export const TRADING_MONETARY_KEYS = [
  "balance",
  "locked",
  "available",
  "availablequote",
  "availablebase",
  "avgbuyprice",
  "totalasset",
  "equity",
  "buyingpower",
  "quantity",
  "quoteamount",
] as const;

/** 앞부분만 남긴다 — 추적에는 필요하지만 전체가 노출되면 계좌를 특정할 수 있다 */
export const TRADING_PARTIAL_MASK_KEYS = ["accountid", "accountnumber", "accountno", "owneruserid"] as const;

/**
 * AI 프롬프트에 절대 들어가면 안 되는 필드.
 *
 * 로그 마스킹과 목록이 다르다. 로그에는 추적을 위해 부분 노출을 허용하는 값도
 * 프롬프트에는 아예 넣지 않는다 — 외부 모델 제공자에게 전송되고 회수할 수 없기 때문이다.
 */
export const TRADING_AI_PROMPT_EXCLUDED_FIELDS = [
  ...TRADING_SECRET_KEYS,
  ...TRADING_MONETARY_KEYS,
  ...TRADING_PARTIAL_MASK_KEYS,
] as const;

/** 프롬프트 컨텍스트로 주입 금지인 컬렉션 */
export const TRADING_AI_PROMPT_EXCLUDED_COLLECTIONS = [
  "trading_connections",
  "trading_accounts",
  "trading_orders",
  "trading_order_intents",
  "trading_fills",
  "trading_portfolio_snapshots",
  "platform_credentials",
] as const;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matches(key: string, list: readonly string[]): boolean {
  const normalized = normalizeKey(key);
  return list.some((entry) => normalized === entry || normalized.endsWith(entry));
}

function partialMask(value: string): string {
  if (value.length <= 4) return TRADING_MASK;
  return `${value.slice(0, 4)}${TRADING_MASK}`;
}

// JWT는 형태가 고유해서 오탐이 거의 없다. Bearer 토큰과 함께 값 자체로도 잡는다.
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi;
// key=value / "key": "value" 형태로 문자열에 박힌 시크릿
const INLINE_SECRET_PATTERN = new RegExp(
  `\\b(${TRADING_SECRET_KEYS.join("|")})\\b(\\s*[:=]\\s*"?)([^\\s",;}]+)`,
  "gi",
);

/** 문자열 안에 섞여 들어온 토큰을 가린다 (에러 메시지·URL·직렬화된 헤더) */
export function maskTradingSecretText(text: string): string {
  return text
    .replace(JWT_PATTERN, TRADING_MASK)
    .replace(BEARER_PATTERN, `$1 ${TRADING_MASK}`)
    .replace(INLINE_SECRET_PATTERN, `$1$2${TRADING_MASK}`);
}

/**
 * 로그에 넘기기 전에 통과시킨다.
 *
 * 순환 참조와 깊이를 방어한다 — 로깅 경로에서 예외가 나면 원래 남기려던 에러까지 잃는다.
 */
export function maskTradingSecrets(value: unknown): unknown {
  return maskValue(value, 0, new WeakSet<object>());
}

function maskValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return TRADING_MASK;
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return maskTradingSecretText(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return { name: value.name, message: maskTradingSecretText(value.message) };
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[circular]";
    seen.add(value as object);

    if (Array.isArray(value)) return value.map((item) => maskValue(item, depth + 1, seen));

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (matches(key, TRADING_SECRET_KEYS) || matches(key, TRADING_MONETARY_KEYS)) {
        result[key] = TRADING_MASK;
        continue;
      }
      if (matches(key, TRADING_PARTIAL_MASK_KEYS)) {
        result[key] = typeof item === "string" ? partialMask(item) : TRADING_MASK;
        continue;
      }
      result[key] = maskValue(item, depth + 1, seen);
    }
    return result;
  }

  // function·symbol 등은 그대로 두면 직렬화 시 새어 나갈 수 있다
  return TRADING_MASK;
}

/**
 * 프롬프트로 나가는 payload에 거래 데이터가 섞였는지 찾는다.
 *
 * 마스킹이 아니라 **차단**이다. 프롬프트에서는 가려서 보내는 것보다
 * 보내지 않는 것이 맞다 — 가린 값도 구조와 존재 사실은 그대로 전달된다.
 */
export function findTradingPromptViolations(value: unknown): string[] {
  const violations: string[] = [];
  walkForViolations(value, "", 0, new WeakSet<object>(), violations);
  return violations;
}

function walkForViolations(
  value: unknown,
  path: string,
  depth: number,
  seen: WeakSet<object>,
  violations: string[],
): void {
  if (depth > MAX_DEPTH || value === null || value === undefined) return;

  if (typeof value === "string") {
    for (const collection of TRADING_AI_PROMPT_EXCLUDED_COLLECTIONS) {
      if (value.includes(collection)) violations.push(`${path || "(root)"}: ${collection}`);
    }
    if (JWT_PATTERN.test(value)) violations.push(`${path || "(root)"}: jwt`);
    JWT_PATTERN.lastIndex = 0;
    return;
  }

  if (typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForViolations(item, `${path}[${index}]`, depth + 1, seen, violations));
    return;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (matches(key, TRADING_AI_PROMPT_EXCLUDED_FIELDS)) {
      violations.push(nextPath);
      continue;
    }
    walkForViolations(item, nextPath, depth + 1, seen, violations);
  }
}

export class TradingPromptLeakError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`[trading] 거래 데이터가 AI 프롬프트로 나가려 했다: ${violations.join(", ")}`);
    this.name = "TradingPromptLeakError";
    this.violations = violations;
  }
}

/** 프롬프트 조립 직전에 호출한다. 위반이 있으면 전송하지 않는다 */
export function assertTradingDataExcludedFromPrompt(value: unknown): void {
  const violations = findTradingPromptViolations(value);
  if (violations.length > 0) throw new TradingPromptLeakError(violations);
}
