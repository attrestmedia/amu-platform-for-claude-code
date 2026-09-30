import "server-only";

/**
 * @docHint
 * @purpose Magazine 리뉴얼 이력 flat 로그 계약 타입·상수 — MIR-201
 * @process thread §12 content_renewal_jobs의 필드를 정책 v1.1 §12(점수 축 분리)·§12.6(처분 2축)에 맞춰 계약화
 * @domain magazine-renewal-log
 * @scope server-contract
 */

/**
 * 재실행 안전용 policyVersion. MIR-200이 확정한 `intelligence-pattern-policy` 버전과
 * 같은 정책 정본을 따른다. 값이 다른 입력은 거부한다.
 */
export const MAGAZINE_RENEWAL_POLICY_VERSION = "intelligence-pattern-policy-v1.1" as const;

export const MAGAZINE_RENEWAL_CONTRACT_TYPE = "magazine-renewal-log" as const;
export const MAGAZINE_RENEWAL_SCHEMA_VERSION = "magazine-renewal-log.v1" as const;

/**
 * status 단일 축 6값 — thread §12 그대로. 축을 늘리지 않는다.
 * (원장 MIR-201 deliverables · verification — 임대·하트비트·데드레터·다축 상태 기계 없음)
 */
export const MAGAZINE_RENEWAL_STATUSES = ["queued", "processing", "review", "ready", "published", "failed"] as const;
export type MagazineRenewalStatus = (typeof MAGAZINE_RENEWAL_STATUSES)[number];

/**
 * 처분 2축 — INTELLIGENCE-PATTERN-POLICY.md §12.6.
 * thread §12의 `decision` 단일 enum(keep/refresh/upgrade/merge/remove)은
 * 콘텐츠 가치 판정과 URL 처리 방법이 섞인 값이어서 폐기됐다(QM-2).
 * 여기서는 두 축을 각각 기록하고 하나의 값으로 합치지 않는다.
 */
export const MAGAZINE_RENEWAL_CONTENT_VALUES = ["keep", "refresh", "rebuild", "duplicate", "expired"] as const;
export type MagazineRenewalContentValue = (typeof MAGAZINE_RENEWAL_CONTENT_VALUES)[number];

export const MAGAZINE_RENEWAL_URL_ACTIONS = ["none", "update", "merge_301", "archive_noindex", "remove_410", "blocked"] as const;
export type MagazineRenewalUrlAction = (typeof MAGAZINE_RENEWAL_URL_ACTIONS)[number];

/** §12.3 scorerType — 점수를 매긴 주체 */
export const MAGAZINE_RENEWAL_SCORER_TYPES = ["rule", "model", "human"] as const;
export type MagazineRenewalScorerType = (typeof MAGAZINE_RENEWAL_SCORER_TYPES)[number];

/**
 * §12.5 auditScore 하위 6축. 이들은 처분(§12.6 contentValue) 판정의 입력이다.
 * 각 축 값은 0~100 실수(추정 — §12.5에 스케일이 정의되지 않았고 감사가 하위 축을 직접 본다.
 * 스케일 확정 시 새 scoreVersion으로 재산출하며 소급 수정하지 않는다).
 */
export const MAGAZINE_RENEWAL_AUDIT_AXES = [
  "knowledgeValue",
  "evergreenValue",
  "evidenceTraceability",
  "strategicFit",
  "retrievalValue",
  "uniqueness",
] as const;
export type MagazineRenewalAuditAxis = (typeof MAGAZINE_RENEWAL_AUDIT_AXES)[number];

/**
 * aiModel·promptVersion은 데이터 필드다 — 모델명을 코드 상수·라우팅 계약으로 만들지 않는다.
 * (원장 MIR-201 deliverables · note — thread §12의 'GLM vs Luna 성과 분석'이 목적)
 * 자유 문자열이기 때문에 identifier가 아니라 safeText로만 검증한다.
 */
export const MAGAZINE_RENEWAL_LIMITS = {
  categoryLength: 120,
  decisionReasonLength: 2000,
  slugLength: 200,
  aiModelLength: 120,
  promptVersionLength: 120,
  sourceRefLength: 200,
  hashLength: 64,
  postIdMax: 2147483647,
  scoresPerRecord: 6,
  explanationLength: 400,
  explanationItems: 12,
} as const;

/** 내용 digest 표준 — sha256 hex(64자). 다른 다이제스트는 저장 전 sha256 hex로 정규화한다. */
export const MAGAZINE_RENEWAL_HASH_PATTERN = /^[a-f0-9]{64}$/;

/** 읽어온 시점의 WordPress 상태. published 전환이 되려면 wpStatus가 "publish"여야 한다. */
export const MAGAZINE_RENEWAL_WP_STATUSES = ["publish", "draft", "pending", "private", "future", "failed"] as const;
export type MagazineRenewalWpStatus = (typeof MAGAZINE_RENEWAL_WP_STATUSES)[number];

/** §12.3 점수 기록의 필수 메타. 기준일·근거 없이 저장된 점수는 재판정 대상이다. */
export interface MagazineRenewalAuditScoreRecord {
  scoreVersion: string;
  policyVersion: string;
  /** 무엇을 보고 매겼는가 — 기사 본문 digest 등 */
  inputDigest: string;
  scorerType: MagazineRenewalScorerType;
  computedAt: string;
  axes: Record<MagazineRenewalAuditAxis, number>;
  /** 왜 그 값인가 — 축별 사유. 비어도 저장은 허용하되 권장(추정 — 요구를 강제하면 3,300건 부담이 과해진다) */
  explanations: string[];
}

/**
 * WordPress 발행 후 read-back 결과 — G-MIR-02 "postId·slug·status·본문 digest를 read-back".
 * 발행이 성공이었는지는 `wpStatus === "publish"`로만 판정한다(실패를 성공으로 기록하지 않는다).
 */
export interface MagazineRenewalPublishResult {
  postId: number;
  slug: string;
  wpStatus: MagazineRenewalWpStatus;
  contentDigest: string;
  readBackAt: string;
  /** read-back 결과가 의도한 대상(같은 postId·같은 slug)과 일치했는가. false면 성공으로 기록할 수 없다 */
  matched: boolean;
}

/**
 * 리뉴얼 이력 flat 로그 1건(재생 단위) = postId 1개.
 * thread §12 content_renewal_jobs 필드 + 이식 검증 대신 2축 처분·§12.3 점수 기록·read-back.
 */
export interface MagazineRenewalLog {
  contractType: typeof MAGAZINE_RENEWAL_CONTRACT_TYPE;
  schemaVersion: typeof MAGAZINE_RENEWAL_SCHEMA_VERSION;
  policyVersion: typeof MAGAZINE_RENEWAL_POLICY_VERSION;
  /** postId 기반 멱등 키 — 같은 postId 재실행이 중복 발행을 만들지 않는다 */
  renewalId: string;
  postId: number;
  contentId: string;
  originalCategory: string;
  targetCategory: string;
  decision: {
    contentValue: MagazineRenewalContentValue;
    urlAction: MagazineRenewalUrlAction;
  };
  decisionReason: string;
  /** 처분 판정의 점수 스냅샷 — §12.5 하위 6축 + §12.3 메타 */
  decisionScores: MagazineRenewalAuditScoreRecord;
  originalSlug: string;
  targetSlug: string;
  /** WordPress 원문 본문 digest와 발행 후 본문 digest — 모델별 성과 분석의 변화 측정 기준 */
  oldContentHash: string;
  newContentHash: string | null;
  /** 데이터 필드 — 모델명·프롬프트 버전. 코드 상수·라우팅 계약이 아니다 */
  aiModel: string;
  promptVersion: string;
  status: MagazineRenewalStatus;
  /** 동일 본문(같은 postId·같은 hash)을 재실행한 기록인지. 중복 발행 판정에만 쓰고 승격에 쓰지 않는다 */
  duplicateOfPrevious: boolean;
  publishResult: MagazineRenewalPublishResult | null;
  processedAt: string | null;
  publishedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
}

/** postId를 리뉴얼 멱등 키로 고정 변환한다. slug가 바뀌어도 키는 유지된다. */
export function magazineRenewalId(postId: number): string {
  return `amu:magazine-renewal:${postId}`;
}

/** MIR-200의 기사 contentId와 동일 규칙 — 리뉴얼 이력과 기사 정본을 postId로 조인한다. */
export function magazineRenewalContentId(postId: number): string {
  return `amu:magazine-knowledge:${postId}`;
}
