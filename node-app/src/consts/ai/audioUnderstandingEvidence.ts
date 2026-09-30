/**
 * @docHint
 * @purpose Tutors audio understanding 모델의 실호출 증거 레지스트리
 * @process 증거 필드 검증  모델 capability 도출에서 증거 존재 여부 확인
 * @domain ai
 * @scope model-catalog
 */

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

/**
 * 실호출로 검증된 모델만 들어간다. 단순 multimodal 표시나 STT 지원은 증거가 아니다
 * (TUTORS-196.deliverables[0]).
 *
 * 등록 절차 — `test/scripts/tutorsAudioUnderstandingProbe.ts --confirm`으로 실호출하고,
 * 그 산출물의 request id를 여기에 옮긴다. 증거 없이 값을 채우지 않는다.
 */
export const AUDIO_UNDERSTANDING_EVIDENCE = {
  /**
   * 2026-09-15 실호출 검증. ko/en 2건 모두 200 · audio in → text out 동작 확인.
   * ko 1,673ms(audio 151 tok) · en 1,394ms(audio 71 tok), usage는 provider가
   * prompt_tokens_details.audio_tokens로 분리 보고한다.
   *
   * **품질 한계(등록과 함께 기록한다)** — ko 전사에서 숫자가 틀렸다(4,237자 → 437자).
   * 고유명사도 흔들린다(Gen Studio → 지앤이 스튜디오). 따라서 전사 정확도를 발음 능력
   * 점수로 쓰지 않는다 — sharedContracts.dataBoundary.scores와 같은 이유다.
   */
  "gpt-audio-mini": {
    modelName: "gpt-audio-mini",
    provider: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    codecs: ["mp3"],
    languages: ["ko", "en"],
    region: "us",
    retention: "OpenAI 표준 보존. ZDR은 AMU 조직·프로젝트 적용 미확인이며 한국 내 inference processing은 미보장",
    agePolicy: "STT와 동일 정책 승계. 자기 신고 미성년은 런타임 토글과 무관하게 차단한다(voiceDataConsent)",
    realCallRequestId: "req_2281c6994dd74c8d86337a991d63c1b9",
    verifiedAt: "2026-09-15T04:00:00.000Z",
    verifiedBy: "claude-opus-5",
    sourceDoc: ".agent/references/.TEMP/tutors196-audio-probe/evidence.json",
  },
} as const satisfies Record<string, AudioUnderstandingEvidence>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

export function hasAudioUnderstandingEvidence(modelName: string): boolean {
  const evidence = (AUDIO_UNDERSTANDING_EVIDENCE as Record<string, AudioUnderstandingEvidence>)[modelName];
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
