/**
 * @docHint
 * @purpose Tutors audio understanding 모델의 실호출 증거 레지스트리
 * @process 증거 필드 검증  모델 capability 도출에서 증거 존재 여부 확인
 * @domain ai
 * @scope model-catalog
 */

import { AI_AUDIO_UNDERSTANDING_EVIDENCE } from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";
export type AudioUnderstandingEvidence = {
  modelName: string;
  provider: string;
  endpoint: string;
  codecs: readonly string[];
  languages: readonly string[];
  region: string;
  retention: string;
  agePolicy: string;
  realCallRequestId: string;
  verifiedAt: string;
  verifiedBy: string;
  sourceDoc: string;
};

export type AudioUnderstandingEvidenceCanonicalShape = [
  AssertAssignable<typeof AI_AUDIO_UNDERSTANDING_EVIDENCE, Record<string, AudioUnderstandingEvidence>>,
];

/**
 * 실호출로 검증된 모델만 들어간다. 단순 multimodal 표시나 STT 지원은 증거가 아니다
 * (TUTORS-196.deliverables[0]).
 *
 * 등록 절차 — `test/scripts/tutorsAudioUnderstandingProbe.ts --confirm`으로 실호출하고,
 * 그 산출물의 request id를 여기에 옮긴다. 증거 없이 값을 채우지 않는다.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

export function hasAudioUnderstandingEvidence(modelName: string): boolean {
  const evidence = (AI_AUDIO_UNDERSTANDING_EVIDENCE as Record<string, AudioUnderstandingEvidence>)[modelName];
  if (!evidence || evidence.modelName !== modelName) return false;

  return (
    isNonEmptyString(evidence.modelName) &&
    isNonEmptyString(evidence.provider) &&
    isNonEmptyString(evidence.endpoint) &&
    isNonEmptyStringList(evidence.codecs) &&
    isNonEmptyStringList(evidence.languages) &&
    isNonEmptyString(evidence.region) &&
    isNonEmptyString(evidence.retention) &&
    isNonEmptyString(evidence.agePolicy) &&
    isNonEmptyString(evidence.realCallRequestId) &&
    isNonEmptyString(evidence.verifiedAt) &&
    isNonEmptyString(evidence.verifiedBy) &&
    isNonEmptyString(evidence.sourceDoc)
  );
}
