import { CURRENT_ACCOUNT_POLICY } from "./accountPolicy";

/**
 * Tutors OpenAI STT 녹음 직전 per-use 고지 계약 (2026-09-13 OpenAI 전환).
 *
 * 정본 개인정보처리방침 제4조 OpenAI 처리위탁과 일치한다. 클라이언트는 이 문구를
 * 임의로 만들지 않고 이 상수만 사용하며, 전송 직전 서버가 정책 버전과 동의를 재검증한다.
 */
export const TUTORS_STT_DISCLOSURE_VERSION = CURRENT_ACCOUNT_POLICY.privacy.version;
export const TUTORS_STT_PROVIDER = "openai" as const;
export const TUTORS_STT_MODEL = "gpt-4o-transcribe" as const;
export const TUTORS_STT_ALLOWED_LANGUAGES = ["ko", "en"] as const;

export const TUTORS_STT_NOTICE =
  "음성 입력을 사용하면 녹음 파일과 선택한 언어 코드가 음성 인식(STT)을 위해 미국의 OpenAI로 전송됩니다. OpenAI의 표준 보존·삭제 조건이 적용되며, AMU는 처리 직후 원음과 전용 전사 결과를 DB·R2·Redis·로그·분석 원장에 저장하지 않습니다. 음성 입력을 허용하지 않으면 텍스트 입력만 사용할 수 있습니다.";
