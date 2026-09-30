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

export const OPENAI_DEFAULT_STT_MODEL = "gpt-4o-mini-transcribe" as const;
export const OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL = "gpt-audio" as const;
export const OPENAI_DEFAULT_TTS_MODEL = "gpt-4o-mini-tts" as const;
// MB-20260927 D2 후보. 기본 모델·실행 가능 여부는 별도 정책 카탈로그가 소유한다.
export const OPENAI_GPT_AUDIO_CANDIDATE_MODEL = "gpt-audio-1.5" as const;
export const OPENAI_GPT_TRANSCRIBE_CANDIDATE_MODEL = "gpt-transcribe" as const;
export const OPENAI_DEFAULT_TTS_SPEED = 1.2 as const;
export const OPENAI_TTS_SPEED_RANGE = { min: 0.25, max: 4, step: 0.25 } as const;
export const ELEVENLABS_TTS_SPEED_RANGE = { min: 0.7, max: 1.2, step: 0.05 } as const;
export const ELEVENLABS_DEFAULT_TTS_MODEL = "eleven-flash-v2-5" as const;
export const ELEVENLABS_DEFAULT_STT_MODEL = "scribe-v2" as const;

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

/**
 * voiceId는 opaque 값이라 추측이 곧 오작동이고, 요율·권리 확인 없이 넣으면 예산 산출이 무의미해진다.
 */
export const ELEVENLABS_APPROVED_VOICE_CATALOG: readonly ElevenLabsApprovedVoiceCatalogEntry[] = [
  // 2026-09-10 계정 조회(GET /api/admin/speech-voices)로 확인한 premade voice 21건 중 3건을 승인했다.
  // 21건 전부 category=premade · 요율 없음이었고, 그중 내레이션에 필요한 성격(서술·설명·중립)만 골랐다.
  //
  // **locales에 "ko"를 넣지 않았다.** 계정 라벨이 전부 language=en이고 한국어 산출 품질을 아직 듣지 못했다.
  // multilingual/flash 모델이 한국어를 처리하는 것과 이 음색이 한국어에서 쓸 만한지는 다른 문제다.
  // 한국어 승인은 EL-402의 청취 평가(최소 2인 rubric) 뒤에 별도로 추가한다.
  //
  // voiceRevision은 관측일이다. premade voice는 공개 revision을 제공하지 않으므로 재조회 시점을 쓴다 —
  // provider가 음색을 조정하면 이 값을 올려 캐시를 무효화한다.
  {
    provider: "elevenlabs",
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
    voiceRevision: "2026-09-10",
    label: "George",
    locales: ["en"],
    tags: ["서술형", "따뜻함", "낮은 톤"],
    rightsStatus: "verified_commercial",
    usage: "production",
    sourceCategory: "premade",
    creditMultiplier: 1,
    verifiedAt: "2026-09-10",
    evidence: ["GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"],
    operationalTerms: {
      noticePeriodDays: null,
      disableAt: null,
      liveModerationEnabled: null,
      rate: null,
      availableForTiers: null,
      observedAt: null,
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "XrExE9yKIg1WjnnlVkGX",
    voiceRevision: "2026-09-10",
    label: "Matilda",
    locales: ["en"],
    tags: ["설명형", "또렷함", "차분함"],
    rightsStatus: "verified_commercial",
    usage: "production",
    sourceCategory: "premade",
    creditMultiplier: 1,
    verifiedAt: "2026-09-10",
    evidence: ["GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"],
    operationalTerms: {
      noticePeriodDays: null,
      disableAt: null,
      liveModerationEnabled: null,
      rate: null,
      availableForTiers: null,
      observedAt: null,
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "SAz9YHcvj6GT2YYXdXww",
    voiceRevision: "2026-09-10",
    label: "River",
    locales: ["en"],
    tags: ["중립", "정보 전달", "편안함"],
    rightsStatus: "verified_commercial",
    usage: "production",
    sourceCategory: "premade",
    creditMultiplier: 1,
    verifiedAt: "2026-09-10",
    evidence: ["GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"],
    operationalTerms: {
      noticePeriodDays: null,
      disableAt: null,
      liveModerationEnabled: null,
      rate: null,
      availableForTiers: null,
      observedAt: null,
    },
  },

  // ---------------------------------------------------------------------------
  // 2026-09-12 EL-402 — 한국어 청취 평가를 거친 Voice 6건 (사용자가 계정에 추가)
  //
  // 종전 승인 3건(George·Matilda·River)은 전부 영어 화자이고, 사용자 청취 결과
  // "영어권 사람이 어설픈 한국어를 하는 느낌"으로 판정됐다. GET /v1/voices 실측에서도
  // 계정 voice 21건 전부 language=en이고 ko verified가 0건이었다. 한국어 내레이션은
  // 모델 파라미터가 아니라 **Voice**가 없어서 성립하지 않았던 것이다.
  //
  // 아래 6건은 전부 `sharing.rate = 1`(요율 배율 없음) · `notice_period = 730일` ·
  // `financial_rewards_enabled = false` · `status = "copied"`이며, `eleven_multilingual_v2`
  // 기준 6건 모두 ko verified다(Yohan Koo만 eleven_flash_v2_5 ko verified가 없다).
  //
  // 2026-09-12 공식 Voice Library/VLA·유료 플랜 조건과 계정 운영 조건을 재확인해
  // 상업 이용 가능 상태로 승격했다. `operationalTerms`는 권리 자체가 아니라
  // provider가 바꿀 수 있는 철회·요율·모더레이션 관측값이다.
  //
  // locales에 "ko"가 들어간 것은 **이 voice들이 한국어 화자라는 관측 사실**이며
  // 서비스 승인은 usage=production + rightsStatus=verified_commercial이 함께 선다.
  // ---------------------------------------------------------------------------
  {
    provider: "elevenlabs",
    voiceId: "uyVNoMrnUku1dZyVEXwD",
    voiceRevision: "2026-09-11",
    label: "Anna Kim - Tender, Calm and Clear",
    locales: ["ko"],
    tags: ["서술형", "차분함", "또렷함"],
    rightsStatus: "verified_commercial",
    sourceCategory: "library_professional",
    usage: "production",
    creditMultiplier: 1,
    verifiedAt: "2026-09-11",
    evidence: [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=narrative_story",
    ],
    operationalTerms: {
      noticePeriodDays: 730,
      disableAt: null,
      liveModerationEnabled: false,
      rate: 1,
      availableForTiers: [],
      observedAt: "2026-09-11",
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "Lb7qkOn5hF8p7qfCDH8q",
    voiceRevision: "2026-09-11",
    label: "Annie - Friendly, Soft and Clear",
    locales: ["ko"],
    tags: ["서술형", "부드러움", "또렷함"],
    rightsStatus: "verified_commercial",
    sourceCategory: "library_professional",
    usage: "production",
    creditMultiplier: 1,
    verifiedAt: "2026-09-11",
    evidence: [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=narrative_story",
    ],
    operationalTerms: {
      noticePeriodDays: 730,
      disableAt: null,
      liveModerationEnabled: false,
      rate: 1,
      availableForTiers: [],
      observedAt: "2026-09-11",
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "zXNMXSB7uul4lbmpaVAn",
    voiceRevision: "2026-09-11",
    label: "Dahye - Clear Korean Explainer",
    locales: ["ko"],
    tags: ["설명형", "또렷함", "서울 억양"],
    rightsStatus: "verified_commercial",
    sourceCategory: "library_professional",
    usage: "production",
    creditMultiplier: 1,
    verifiedAt: "2026-09-11",
    evidence: [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=informative_educational",
    ],
    operationalTerms: {
      noticePeriodDays: 730,
      disableAt: null,
      liveModerationEnabled: false,
      rate: 1,
      availableForTiers: [],
      observedAt: "2026-09-11",
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "5I7B1di44aCL15NkP0jn",
    voiceRevision: "2026-09-11",
    label: "Kanna - Calm & Friendly",
    locales: ["ko"],
    tags: ["대화형", "차분함", "친근함"],
    rightsStatus: "verified_commercial",
    sourceCategory: "library_professional",
    usage: "production",
    creditMultiplier: 1,
    verifiedAt: "2026-09-11",
    evidence: [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=entertainment_tv",
    ],
    operationalTerms: {
      noticePeriodDays: 730,
      disableAt: null,
      liveModerationEnabled: false,
      rate: 1,
      availableForTiers: [],
      observedAt: "2026-09-11",
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "CxErO97xpQgQXYmapDKX",
    voiceRevision: "2026-09-11",
    label: "Theo - Warm, Smooth and Soft",
    locales: ["ko"],
    tags: ["대화형", "따뜻함", "부드러움"],
    rightsStatus: "verified_commercial",
    sourceCategory: "library_professional",
    usage: "production",
    creditMultiplier: 1,
    verifiedAt: "2026-09-11",
    evidence: [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=conversational",
    ],
    operationalTerms: {
      noticePeriodDays: 730,
      disableAt: null,
      liveModerationEnabled: false,
      rate: 1,
      availableForTiers: [],
      observedAt: "2026-09-11",
    },
  },
  {
    provider: "elevenlabs",
    voiceId: "4JJwo477JUAx3HV0T7n7",
    voiceRevision: "2026-09-11",
    label: "Yohan Koo - Encouraging, Clear and Airy",
    locales: ["ko"],
    tags: ["대화형", "또렷함", "격려형"],
    rightsStatus: "verified_commercial",
    sourceCategory: "library_professional",
    usage: "production",
    creditMultiplier: 1,
    verifiedAt: "2026-09-11",
    evidence: [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=conversational",
    ],
    operationalTerms: {
      noticePeriodDays: 730,
      disableAt: null,
      liveModerationEnabled: false,
      rate: 1,
      availableForTiers: [],
      observedAt: "2026-09-11",
    },
  },
];

const _ELEVENLABS_VOICE_MAP = new Map(
  ELEVENLABS_APPROVED_VOICE_CATALOG.map((entry) => [entry.voiceId, entry]),
);

export function getElevenLabsVoiceCatalogEntry(voiceId: string) {
  return _ELEVENLABS_VOICE_MAP.get(String(voiceId || "").trim());
}

export function isApprovedElevenLabsVoiceId(voiceId: string, options: { productionOnly?: boolean } = {}) {
  const entry = getElevenLabsVoiceCatalogEntry(voiceId);
  if (!entry) return false;
  return options.productionOnly === true
    ? entry.rightsStatus === "verified_commercial" && entry.usage === "production"
    : true;
}

export const ELEVENLABS_APPROVED_VOICE_IDS = ELEVENLABS_APPROVED_VOICE_CATALOG.map((entry) => entry.voiceId);
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
