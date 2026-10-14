import {
  AI_ELEVENLABS_APPROVED_VOICE_CATALOG,
  AI_ELEVENLABS_APPROVED_VOICE_IDS,
  AI_ELEVENLABS_DEFAULT_STT_MODEL,
  AI_ELEVENLABS_DEFAULT_TTS_MODEL,
} from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";
export interface IOpenAiVoiceCatalogEntry {
  provider: "openai";
  voiceId:
    | "alloy"
    | "ash"
    | "ballad"
    | "coral"
    | "echo"
    | "fable"
    | "nova"
    | "onyx"
    | "sage"
    | "shimmer"
    | "verse"
    | "marin"
    | "cedar";
  label: string;
  locales: readonly string[];
  tags: string[];
  instructions: string;
}

export type OpenAiVoiceGenderHint = "feminine" | "masculine" | "neutral";
export type PersonaBinaryGenderValue = "남성" | "여성";

export const PERSONA_BINARY_GENDER_OPTIONS = [
  { value: "남성", label: { ko: "남성", en: "Male" } },
  { value: "여성", label: { ko: "여성", en: "Female" } },
] as const satisfies readonly { value: PersonaBinaryGenderValue; label: { ko: string; en: string } }[];

// MB-20260927 D2 후보. 기본 모델·실행 가능 여부는 별도 정책 카탈로그가 소유한다.
export const OPENAI_GPT_AUDIO_CANDIDATE_MODEL = "gpt-audio-1.5" as const;
export const OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL = "gpt-transcribe" as const;
export const OPENAI_DEFAULT_TTS_SPEED = 1.2 as const;
export const OPENAI_TTS_SPEED_RANGE = { min: 0.25, max: 4, step: 0.25 } as const;
export const ELEVENLABS_TTS_SPEED_RANGE = { min: 0.7, max: 1.2, step: 0.05 } as const;
export const ELEVENLABS_DEFAULT_TTS_MODEL = AI_ELEVENLABS_DEFAULT_TTS_MODEL;
export const ELEVENLABS_DEFAULT_STT_MODEL = AI_ELEVENLABS_DEFAULT_STT_MODEL;

/**
 * ElevenLabs voice ID는 계정에 귀속된 opaque 값이다. **추측해서 적지 않는다.**
 * 실제 계정에서 조회한 값만 넣으며, 조회 경로는 `GET /api/admin/speech-voices`다.
 *
 * ---------------------------------------------------------------------------
 * EL-004 / EL-R12 — 추가 요율을 타입으로 막는다
 *
 * ElevenLabs 공식 문서 기준, credit multiplier는 **Voice Library에 공유된 Professional Voice Clone**에만
 * 붙는다(소유자가 설정한 legacy custom rate). 또한 일부 Library voice는 유료 구독 전용이다.
 *   > "if a voice has a 2x multiplier, generating audio will cost twice as many credits"
 *   > "Some voices in the Voice Library are only available to users with a paid subscription."
 *
 * 그래서 초기 파일럿 승인 목록은 **계정 기본 제공(premade) voice로 한정**한다.
 * `sourceCategory`와 `creditMultiplier`를 리터럴 타입으로 고정했으므로, Library voice나 배율이 붙은
 * voice를 넣으려면 **타입을 먼저 바꿔야 한다** — 예산 산출($50/월)이 조용히 틀어지는 경로를 컴파일 단계에서 막는다.
 * ---------------------------------------------------------------------------
 */
export type ElevenLabsApprovedVoiceCatalogEntry = {
  provider: "elevenlabs";
  voiceId: string;
  voiceRevision: string;
  label: string;
  locales: readonly string[];
  tags: readonly string[];
  /** 운영 승인 상태 — production 승격은 rightsStatus와 usage를 함께 확인한다. */
  rightsStatus: "verified_commercial" | "pending_commercial_review";
  /**
   * `library_professional`은 Voice Library에서 계정으로 복사한 Professional Voice Clone이다.
   * **배율이 붙을 수 있는 유일한 부류**이므로 `creditMultiplier: 1` 고정과 함께만 허용한다
   * (rate는 계정 조회의 `sharing.rate`로 확인한다). 배율이 1이 아닌 voice를 넣으려면 타입부터 바꾼다.
   */
  sourceCategory: "premade" | "library_professional";
  /** 상업 사용 범위. evaluation_only는 검증 중인 후보, production은 서비스 발화 허용이다. */
  usage: "production" | "evaluation_only";
  /** 표준 요율만 허용한다. 배율이 붙은 voice를 넣으려면 이 타입부터 바꾼다. */
  creditMultiplier: 1;
  /** 요율·권리를 실제 계정에서 확인한 시각(ISO). 미확인 voice를 목록에 넣지 않는다. */
  verifiedAt: string;
  evidence: readonly string[];
  operationalTerms: ElevenLabsVoiceOperationalTerms;
};

export type ElevenLabsVoiceOperationalTerms = {
  noticePeriodDays: number | null;
  disableAt: number | null;
  liveModerationEnabled: boolean | null;
  rate: 1 | null;
  availableForTiers: readonly string[] | null;
  observedAt: string | null;
};

export type VoiceCatalogCanonicalShape = [
  AssertAssignable<typeof AI_ELEVENLABS_APPROVED_VOICE_CATALOG, readonly ElevenLabsApprovedVoiceCatalogEntry[]>,
  AssertAssignable<typeof AI_ELEVENLABS_APPROVED_VOICE_IDS, readonly string[]>,
];

/**
 * voiceId는 opaque 값이라 추측이 곧 오작동이고, 요율·권리 확인 없이 넣으면 예산 산출이 무의미해진다.
 */
const _ELEVENLABS_VOICE_MAP = new Map<string, ElevenLabsApprovedVoiceCatalogEntry>(
  AI_ELEVENLABS_APPROVED_VOICE_CATALOG.map((entry) => [entry.voiceId, entry]),
);

export function getElevenLabsVoiceCatalogEntry(voiceId: string): ElevenLabsApprovedVoiceCatalogEntry | undefined {
  return _ELEVENLABS_VOICE_MAP.get(String(voiceId || "").trim());
}

export function isApprovedElevenLabsVoiceId(voiceId: string, options: { productionOnly?: boolean } = {}) {
  const entry = getElevenLabsVoiceCatalogEntry(voiceId);
  if (!entry) return false;
  return options.productionOnly === true
    ? entry.rightsStatus === "verified_commercial" && entry.usage === "production"
    : true;
}

export const TTS_PREVIEW_ASSET_LIMIT = { private: 5, public: 5 } as const;
export const TTS_PREVIEW_GENERATION_LEASE_MS = 5 * 60 * 1000;
export const TTS_PREVIEW_FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const TTS_PREVIEW_DELETED_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const OPENAI_VOICE_PREVIEW_SAMPLE_TEXT =
  "안녕하세요. 함께 차근차근 배워봐요. Hello, let's learn step by step together." as const;

export const OPENAI_APPROVED_VOICE_CATALOG = [
  {
    provider: "openai",
    voiceId: "ash",
    label: "Ash",
    locales: ["ko", "en", "ja"],
    tags: ["차분한 멘토", "남성적"],
    instructions: "Speak with calm pacing, gentle warmth, and stable clarity.",
  },
  {
    provider: "openai",
    voiceId: "sage",
    label: "Sage",
    locales: ["ko", "en"],
    tags: ["또렷하고 학구적", "중성적", "남성적"],
    instructions: "Speak like a thoughtful tutor with precise, patient emphasis.",
  },
  {
    provider: "openai",
    voiceId: "verse",
    label: "Verse",
    locales: ["ko", "en"],
    tags: ["표현력 풍부", "중성적"],
    instructions: "Speak clearly with articulate phrasing and confident guidance.",
  },
  {
    provider: "openai",
    voiceId: "coral",
    label: "Coral",
    locales: ["ko", "en"],
    tags: ["밝고 부드러움", "여성적"],
    instructions: "Speak with a friendly and natural warmth, light and approachable.",
  },
  {
    provider: "openai",
    voiceId: "nova",
    label: "Nova",
    locales: ["ko", "en"],
    tags: ["밝고 활기참", "여성적"],
    instructions: "Speak with lively energy and upbeat, natural enthusiasm.",
  },
  {
    provider: "openai",
    voiceId: "alloy",
    label: "Alloy",
    locales: ["ko", "en"],
    tags: ["균형 잡힌 중립", "중성적"],
    instructions: "Speak in a crisp and reliable tone with minimal affectation.",
  },
  {
    provider: "openai",
    voiceId: "echo",
    label: "Echo",
    locales: ["ko", "en"],
    tags: ["부드럽고 따뜻함", "중성적", "남성적"],
    instructions: "Speak softly and evenly with natural conversational rhythm.",
  },
  {
    provider: "openai",
    voiceId: "ballad",
    label: "Ballad",
    locales: ["en", "ko"],
    tags: ["극적이고 깊이 있음", "남성적"],
    instructions: "Speak with cinematic emphasis and expressive dramatic cadence.",
  },
  {
    provider: "openai",
    voiceId: "fable",
    label: "Fable",
    locales: ["en", "ko"],
    tags: ["감성적", "약간 영국식 느낌", "중성적"],
    instructions: "Speak with imaginative color and story-like expressiveness.",
  },
  {
    provider: "openai",
    voiceId: "onyx",
    label: "Onyx",
    locales: ["en", "ko"],
    tags: ["낮고 권위적", "남성적"],
    instructions: "Speak with grounded gravity and controlled intensity.",
  },
  {
    provider: "openai",
    voiceId: "shimmer",
    label: "Shimmer",
    locales: ["en", "ko"],
    tags: ["밝고 상냥함", "여성적"],
    instructions: "Speak smoothly with polished softness and graceful emphasis.",
  },
  {
    provider: "openai",
    voiceId: "marin",
    label: "Marin",
    locales: ["ko", "en"],
    tags: ["자연스럽고 고급스러움", "여성적"],
    instructions: "Speak with natural elegance, smooth clarity, and refined warmth.",
  },
  {
    provider: "openai",
    voiceId: "cedar",
    label: "Cedar",
    locales: ["ko", "en"],
    tags: ["차분하고 신뢰감 있음", "남성적"],
    instructions: "Speak with calm confidence, grounded warmth, and steady clarity.",
  },
] as const satisfies readonly IOpenAiVoiceCatalogEntry[];

export const OPENAI_APPROVED_VOICE_IDS = OPENAI_APPROVED_VOICE_CATALOG.map((entry) => entry.voiceId);

const _OPENAI_VOICE_MAP = new Map<string, IOpenAiVoiceCatalogEntry>(
  OPENAI_APPROVED_VOICE_CATALOG.map((entry) => [entry.voiceId, entry]),
);

export function resolveOpenAiVoiceGenderHint(gender: unknown): OpenAiVoiceGenderHint | undefined {
  const value = String(gender || "")
    .trim()
    .toLowerCase();
  if (!value) return undefined;

  if (/여성|여자|\bfemale\b|\bfeminine\b|\bwoman\b|\bgirl\b|\blady\b/.test(value)) return "feminine";
  if (/남성|남자|\bmale\b|\bmasculine\b|\bman\b|\bboy\b|\bgentleman\b/.test(value)) return "masculine";
  if (/중성|무성|\bneutral\b|\bandrogynous\b|\bnon[-\s]?binary\b|\bgenderless\b/.test(value)) return "neutral";

  return undefined;
}

export function getOpenAiVoiceGenderTag(hint?: OpenAiVoiceGenderHint) {
  if (hint === "feminine") return "여성적";
  if (hint === "masculine") return "남성적";
  if (hint === "neutral") return "중성적";
  return "";
}

export function resolvePersonaBinaryGenderValue(
  gender: unknown,
  fallback?: PersonaBinaryGenderValue | "",
): PersonaBinaryGenderValue | "" {
  const hint = resolveOpenAiVoiceGenderHint(gender);
  if (hint === "masculine") return "남성";
  if (hint === "feminine") return "여성";
  return fallback || "";
}

export function getOpenAiVoiceCatalogEntry(voiceId: string) {
  const key = String(voiceId || "")
    .trim()
    .toLowerCase();
  return _OPENAI_VOICE_MAP.get(key);
}

export function isApprovedOpenAiVoiceId(voiceId: string) {
  return Boolean(getOpenAiVoiceCatalogEntry(voiceId));
}

export function isOpenAiVoiceAllowedForGenderHint(voiceId: string, hint?: OpenAiVoiceGenderHint) {
  const tag = getOpenAiVoiceGenderTag(hint);
  if (!tag) return true;

  const entry = getOpenAiVoiceCatalogEntry(voiceId);
  if (!entry) return false;
  return entry.tags.includes(tag);
}

export function getOpenAiVoiceCatalogForGenderHint(hint?: OpenAiVoiceGenderHint) {
  const tag = getOpenAiVoiceGenderTag(hint);
  if (!tag) return OPENAI_APPROVED_VOICE_CATALOG;

  const filtered = OPENAI_APPROVED_VOICE_CATALOG.filter((entry) =>
    (entry.tags as readonly string[]).includes(tag),
  );
  return filtered.length > 0 ? filtered : OPENAI_APPROVED_VOICE_CATALOG;
}
