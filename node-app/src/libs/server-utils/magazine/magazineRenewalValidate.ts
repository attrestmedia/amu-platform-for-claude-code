import "server-only";

import crypto from "crypto";

import {
  MAGAZINE_RENEWAL_AUDIT_AXES,
  MAGAZINE_RENEWAL_CONTRACT_TYPE,
  MAGAZINE_RENEWAL_CONTENT_VALUES,
  MAGAZINE_RENEWAL_HASH_PATTERN,
  MAGAZINE_RENEWAL_LIMITS,
  MAGAZINE_RENEWAL_POLICY_VERSION,
  MAGAZINE_RENEWAL_SCHEMA_VERSION,
  MAGAZINE_RENEWAL_SCORER_TYPES,
  MAGAZINE_RENEWAL_STATUSES,
  MAGAZINE_RENEWAL_URL_ACTIONS,
  MAGAZINE_RENEWAL_WP_STATUSES,
  magazineRenewalContentId,
  magazineRenewalId,
  type MagazineRenewalLog,
} from "./magazineRenewalContract";
import {
  DATE_PATTERN,
  MagazineKnowledgeContractError,
  assertKeys,
  enumValue,
  fail,
  identifier,
  isRecord,
  safeText,
  textList,
} from "./magazineKnowledgeSafety";

/**
 * @docHint
 * @purpose 리뉴얼 이력 flat 로그 저장 전 fail-closed 검증 — MIR-201
 * @process 계약·enum·길이·몸조 검증 -> 처분 2축·점수 기록·read-back 교차 규칙 -> digest 헬퍼
 * @domain magazine-renewal-log
 * @scope server-contract
 */

function percentage(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    fail(field, "0~100 숫자여야 합니다.");
  }
  return value;
}

function decisionScoreRecord(value: unknown): void {
  if (!isRecord(value)) fail("decisionScores", "객체가 필요합니다.");
  const required = ["scoreVersion", "policyVersion", "inputDigest", "scorerType", "computedAt", "axes", "explanations"];
  assertKeys(value, required, required, "decisionScores");
  safeText(value.scoreVersion, 80, "decisionScores.scoreVersion");
  if (value.policyVersion !== MAGAZINE_RENEWAL_POLICY_VERSION) {
    fail("decisionScores.policyVersion", "지원하는 policyVersion이 아닙니다.");
  }
  if (typeof value.inputDigest !== "string" || !MAGAZINE_RENEWAL_HASH_PATTERN.test(value.inputDigest.trim())) {
    fail("decisionScores.inputDigest", "sha256 hex 다이제스트가 필요합니다.");
  }
  enumValue(value.scorerType, MAGAZINE_RENEWAL_SCORER_TYPES, "decisionScores.scorerType");
  if (typeof value.computedAt !== "string" || !DATE_PATTERN.test(value.computedAt.trim())) {
    fail("decisionScores.computedAt", "ISO 날짜가 필요합니다.");
  }
  if (!isRecord(value.axes)) fail("decisionScores.axes", "객체가 필요합니다.");
  for (const axis of MAGAZINE_RENEWAL_AUDIT_AXES) {
    percentage((value.axes as Record<string, unknown>)[axis], `decisionScores.axes.${axis}`);
  }
  textList(value.explanations, "decisionScores.explanations", MAGAZINE_RENEWAL_LIMITS.explanationItems, MAGAZINE_RENEWAL_LIMITS.explanationLength);
}

function publishResult(value: unknown): void {
  if (!isRecord(value)) fail("publishResult", "객체가 필요합니다.");
  const required = ["postId", "slug", "wpStatus", "contentDigest", "readBackAt", "matched"];
  assertKeys(value, required, required, "publishResult");
  if (!Number.isInteger(value.postId) || Number(value.postId) <= 0) fail("publishResult.postId", "양의 정수가 필요합니다.");
  identifier(value.slug, "publishResult.slug", true);
  enumValue(value.wpStatus, MAGAZINE_RENEWAL_WP_STATUSES, "publishResult.wpStatus");
  if (typeof value.contentDigest !== "string" || !MAGAZINE_RENEWAL_HASH_PATTERN.test(value.contentDigest.trim())) {
    fail("publishResult.contentDigest", "sha256 hex 다이제스트가 필요합니다.");
  }
  if (typeof value.readBackAt !== "string" || !DATE_PATTERN.test(value.readBackAt.trim())) {
    fail("publishResult.readBackAt", "ISO 날짜가 필요합니다.");
  }
  if (typeof value.matched !== "boolean") fail("publishResult.matched", "boolean이 필요합니다.");
}

export type MagazineRenewalLogValidation =
  | { ok: true; log: MagazineRenewalLog }
  | { ok: false; reasonCode: "magazine_renewal_invalid"; issues: string[] };

export function validateMagazineRenewalLog(value: unknown): MagazineRenewalLogValidation {
  try {
    if (!isRecord(value)) fail("log", "객체가 필요합니다.");
    const required = [
      "contractType", "schemaVersion", "policyVersion", "renewalId", "postId", "contentId",
      "originalCategory", "targetCategory", "decision", "decisionReason", "decisionScores",
      "originalSlug", "targetSlug", "oldContentHash", "newContentHash", "aiModel", "promptVersion",
      "status", "duplicateOfPrevious", "publishResult", "processedAt", "publishedAt", "failedAt", "failureReason",
    ];
    assertKeys(value, required, required, "log");
    if (value.contractType !== MAGAZINE_RENEWAL_CONTRACT_TYPE) fail("contractType", "지원하지 않는 contractType입니다.");
    if (value.schemaVersion !== MAGAZINE_RENEWAL_SCHEMA_VERSION) fail("schemaVersion", "지원하지 않는 schemaVersion입니다.");
    if (value.policyVersion !== MAGAZINE_RENEWAL_POLICY_VERSION) fail("policyVersion", "지원하는 policyVersion이 아닙니다.");

    if (!Number.isInteger(value.postId) || Number(value.postId) <= 0 || Number(value.postId) > MAGAZINE_RENEWAL_LIMITS.postIdMax) {
      fail("postId", "양의 정수가 필요합니다.");
    }
    const postId = Number(value.postId);
    if (value.renewalId !== magazineRenewalId(postId)) fail("renewalId", "postId와 결합된 renewalId여야 합니다.");
    if (value.contentId !== magazineRenewalContentId(postId)) fail("contentId", "postId와 결합된 contentId여야 합니다.");

    safeText(value.originalCategory, MAGAZINE_RENEWAL_LIMITS.categoryLength, "originalCategory");
    safeText(value.targetCategory, MAGAZINE_RENEWAL_LIMITS.categoryLength, "targetCategory");

    if (!isRecord(value.decision)) fail("decision", "객체가 필요합니다.");
    assertKeys(value.decision, ["contentValue", "urlAction"], ["contentValue", "urlAction"], "decision");
    enumValue(value.decision.contentValue, MAGAZINE_RENEWAL_CONTENT_VALUES, "decision.contentValue");
    enumValue(value.decision.urlAction, MAGAZINE_RENEWAL_URL_ACTIONS, "decision.urlAction");

    safeText(value.decisionReason, MAGAZINE_RENEWAL_LIMITS.decisionReasonLength, "decisionReason");
    decisionScoreRecord(value.decisionScores);

    identifier(value.originalSlug, "originalSlug", true);
    identifier(value.targetSlug, "targetSlug", true);
    if (typeof value.oldContentHash !== "string" || !MAGAZINE_RENEWAL_HASH_PATTERN.test(value.oldContentHash.trim())) {
      fail("oldContentHash", "sha256 hex 다이제스트가 필요합니다.");
    }
    if (value.newContentHash !== null) {
      if (typeof value.newContentHash !== "string" || !MAGAZINE_RENEWAL_HASH_PATTERN.test(value.newContentHash.trim())) {
        fail("newContentHash", "null 또는 sha256 hex 다이제스트여야 합니다.");
      }
    }

    // aiModel·promptVersion은 데이터 필드다 — 코드 상수·라우팅 계약이 아니다. 자유 문자열로만 검증한다.
    safeText(value.aiModel, MAGAZINE_RENEWAL_LIMITS.aiModelLength, "aiModel");
    safeText(value.promptVersion, MAGAZINE_RENEWAL_LIMITS.promptVersionLength, "promptVersion");

    const status = enumValue(value.status, MAGAZINE_RENEWAL_STATUSES, "status");
    if (typeof value.duplicateOfPrevious !== "boolean") fail("duplicateOfPrevious", "boolean이 필요합니다.");

    if (value.publishResult !== null) publishResult(value.publishResult);
    if (value.processedAt !== null && (typeof value.processedAt !== "string" || !DATE_PATTERN.test(value.processedAt.trim()))) {
      fail("processedAt", "null 또는 ISO 날짜여야 합니다.");
    }
    if (value.publishedAt !== null && (typeof value.publishedAt !== "string" || !DATE_PATTERN.test(value.publishedAt.trim()))) {
      fail("publishedAt", "null 또는 ISO 날짜여야 합니다.");
    }
    if (value.failedAt !== null && (typeof value.failedAt !== "string" || !DATE_PATTERN.test(value.failedAt.trim()))) {
      fail("failedAt", "null 또는 ISO 날짜여야 합니다.");
    }
    if (value.failureReason !== null) safeText(value.failureReason, MAGAZINE_RENEWAL_LIMITS.decisionReasonLength, "failureReason", true);

    // 교차 규칙 — published 전환은 반드시 read-back이 실제 publish를 확인한 경우에만 가능하다.
    // 실패를 성공으로 기록하지 않는다(G-MIR-02).
    if (status === "published") {
      if (!isRecord(value.publishResult)) fail("publishResult", "published에는 read-back 결과가 필요합니다.");
      if ((value.publishResult as Record<string, unknown>).wpStatus !== "publish") {
        fail("publishResult.wpStatus", "published는 wpStatus=publish인 read-back만으로 기록할 수 있습니다.");
      }
      if ((value.publishResult as Record<string, unknown>).matched !== true) {
        fail("publishResult.matched", "read-back이 의도한 대상과 일치하지 않아 published로 기록할 수 없습니다.");
      }
      if (value.newContentHash === null) fail("newContentHash", "published에는 새 본문 digest가 필요합니다.");
      if (value.publishedAt === null) fail("publishedAt", "published에는 publishedAt이 필요합니다.");
    } else {
      if (value.publishResult !== null) fail("publishResult", "published가 아닌 상태에는 read-back을 기록할 수 없습니다.");
      if (status === "failed") {
        if (value.failedAt === null) fail("failedAt", "failed에는 failedAt이 필요합니다.");
        if (value.failureReason === null) fail("failureReason", "failed에는 실패 사유가 필요합니다.");
      }
    }

    return { ok: true, log: value as unknown as MagazineRenewalLog };
  } catch (error) {
    const message = error instanceof MagazineKnowledgeContractError ? error.message : "계약 검증에 실패했습니다.";
    return { ok: false, reasonCode: "magazine_renewal_invalid", issues: [message] };
  }
}

/** 내용 digest 표준 헬퍼 — sha256 hex. 다른 다이제스트 입력은 이 함수로 정규화해 저장한다. */
export function magazineRenewalContentHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
