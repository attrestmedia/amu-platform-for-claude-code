export type AiProviderType = (typeof import("consts/ai").AI_PROVIDER_TYPES)[number]; // 배열에서 타입 파생 (컴파일 타임에 생성)

export type TextProviderType = Exclude<AiProviderType, "photoroom" | "pixian">; // 텍스트 LLM 전용
export type ImageProviderType = (typeof import("consts/ai").IMAGE_PROVIDER_TYPES)[number]; // 이미지 생성 전용
export type ImageToolProviderType = Extract<AiProviderType, "photoroom" | "pixian">; // 이미지 유틸/툴 전용

/** 과금 원장 전용 provider union. 텍스트/이미지 후보(AiProviderType)를 넓히지 않는다. */
export type BillableProviderType = (typeof import("consts/ai").BILLABLE_PROVIDER_TYPES)[number];

export type AiModalityType = (typeof import("consts/ai").AI_MODALITY_TYPES)[number];

export type AiMessageBaseType = (typeof import("consts/ai").AI_MESSAGE_BASE_TYPES)[number];
export type AiMessageType = AiMessageBaseType | "system";

export type UserScopeType = (typeof import("consts/ai").USER_SCOPE_TYPES)[number];
export type UserExtendedScopeType = UserScopeType | "all";
export type UploadScopeType = UserScopeType | "guest";

export type NpcScopeType = "user" | "npc";
export type ModelScopeType = "user" | "model";
export type UiScopeType = "user" | "system";
export type SpeechProviderType = "openai" | "google" | "elevenlabs" | "qwen";
export type SpeechVoiceSettings = {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  speed?: number;
};
export type SpeechIntent = {
  emotion?: string;
  delivery?: string;
  pause?: "none" | "short" | "long";
  tags?: string[];
};
export type ChatModelServiceType = "amu" | "tutors" | "game";
export type ChatModelScopeType = "service" | "universe" | "persona";
export type ChatModelOptionState = "available" | "locked";
export type ChatModelPreferenceMode = "recommended" | "preference";
export type ChatModelFallbackReasonCode =
  | "saved_model_unavailable"
  | "provider_credential_unavailable"
  | "provider_rate_limited"
  | "provider_unavailable";

/** TUTORS-193 D1·D4·D5 — turn 단위 입력 modality. 클라이언트 값은 신뢰하지 않고 서버가 확정한다. */
export const CHAT_INPUT_MODALITIES = ["text", "audio"] as const;
export type ChatInputModalityType = (typeof CHAT_INPUT_MODALITIES)[number];

export type ChatImageInputType = {
  mimeType: "image/jpeg";
  data: string;
  width: number;
  height: number;
  sizeBytes: number;
  source: "camera" | "library";
};

export type ChatImagePreviewType = {
  url: string;
  width: number;
  height: number;
};

export type SystemCodeType = (typeof import("consts/ai").SYSTEM_CODES)[number];

// systemcode에는 api 응답을 통한 mood 및 다양한 action 코드가 담길 수 있음 (필요시 확장)
export type MoodSystemCodeType = `mood-${string}`;
export type SystemCodeLikeType = SystemCodeType | MoodSystemCodeType;

// NOTE: API(JSON) 왕복 시 Date는 string으로 직렬화됨
// API에서 사용하는 timestamp는 DateLike로 통일
export type DateLike = Date | string | number;

export interface ISpeechVoiceProfile {
  provider?: SpeechProviderType;
  voiceId?: string;
  modelName?: string;
  locale?: string;
  instructions?: string;
  /** provider가 발급한 opaque voice ID/설정은 소문자 정규화하지 않는다. */
  voiceRevision?: string;
  provenance?: "account_library" | "approved_catalog" | "provider_preview" | "user_request" | string;
  rightsStatus?: "unknown" | "pending" | "verified_commercial" | "withdrawn" | string;
  settings?: SpeechVoiceSettings;
  speechIntent?: SpeechIntent;
  format?: string;
  speed?: number;
  profileVersion?: number;
  voiceFingerprint?: string;
  source?: string;
  tags?: string[];
  resolvedAt?: DateLike;
}

export interface IMessageAudioMeta {
  provider?: SpeechProviderType;
  voiceId?: string;
  modelName?: string;
  locale?: string;
  voiceFingerprint?: string;
  cacheKey?: string;
  contentType?: string;
  bytes?: number;
  durationMs?: number;
  storage?: Record<string, unknown>;
  status?: "pending" | "ready" | "failed";
  errorCode?: string;
  generatedAt?: DateLike;
}

// 기본 메시지 속성들을 담은 베이스 인터페이스
interface IBaseMessage {
  timestamp?: DateLike;
  translation?: string;
  systemCode?: SystemCodeLikeType[];
  productCode?: string[]; // 상품 코드 목록
  clientId?: string; // 중복 방지/동기화용
  sessionId?: string; // 클라이언트 세션별 표시/기록 구분용
  audioMeta?: IMessageAudioMeta;
}

// 사용량 정보를 위한 베이스 인터페이스
interface IBaseUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface IAiResponseMeta {
  saveOk?: boolean;
  lockApplied?: boolean;
  userClientId?: string;
  assistantClientId?: string;
  [key: string]: unknown;
}

export interface IChatModelOption {
  key: string;
  provider: TextProviderType;
  modelName: string;
  displayName: string;
  state: ChatModelOptionState;
  defaultModel: boolean;
  recommendedModel: boolean;
  adminOnly?: boolean;
  supportsImageInput: boolean;
  /** TUTORS-193 D2 — 카탈로그 capability 원본. 하위 audioEligible 판정의 입력이다. */
  supportsAudioInput: boolean;
  supportsAudioUnderstanding: boolean;
  /** TUTORS-193 D5 — isAudioCapableChatModel(item) 결과. audio 턴 후보 필터링에 쓴다. */
  audioEligible: boolean;
  note?: { ko: string; en: string };
  availabilityReason?: "provider_credential_unavailable";
}

export interface IChatModelReference {
  key: string;
  provider: TextProviderType;
  modelName: string;
  displayName?: string;
}

export interface IChatModelSelection {
  key: string;
  provider: TextProviderType;
  modelName: string;
  source: "request" | "preference" | "policy_default" | "fallback";
  fallbackReason?: ChatModelFallbackReasonCode;
  fallbackFrom?: IChatModelReference;
  policyDefaultReasonCode?: "default_model_internal" | "default_model_admin_only" | "default_model_deprecated";
}

export interface IChatModelPolicyResult {
  service: ChatModelServiceType;
  scopeType: ChatModelScopeType;
  scopeId: string;
  selectionMode: "free" | "locked";
  preferenceMode: ChatModelPreferenceMode;
  recommended: IChatModelReference;
  recommendationFallbackReason?: ChatModelFallbackReasonCode;
  fallbackChain: IChatModelReference[];
  options: IChatModelOption[];
  selected: IChatModelSelection;
  /** TUTORS-193 D1 — 이 정책 조회/저장이 어떤 입력 modality로 확정됐는지. 기본값은 "text"다. */
  inputModality: ChatInputModalityType;
  /** gateOpen && 적격 옵션(availabile 상태 + audioEligible)이 1개 이상 존재해야 true다. */
  audioTurnAvailable: boolean;
  audioTurnReasonCode?: "gate_closed" | "no_audio_capable_model" | "selected_model_not_audio_capable";
}

export interface ISpeechTranscribeResponse {
  transcript: string;
  language?: string;
  durationMs?: number;
  confidence?: number;
  usage?: IBaseUsage;
  billing?: {
    ok: boolean;
    coins: number;
  };
  meta?: Record<string, unknown>;
}

export interface ISpeechSynthesizeResponse {
  audioUrl?: string;
  contentType?: string;
  durationMs?: number;
  voice?: {
    provider?: SpeechProviderType;
    voiceId?: string;
    modelName?: string;
    locale?: string;
  };
  usage?: IBaseUsage;
  billing?: {
    ok: boolean;
    coins: number;
  };
  meta?: Record<string, unknown>;
}

export interface IMessage extends IBaseMessage {
  role: AiMessageType;
  content: string;
  imagePreview?: ChatImagePreviewType;
}

// 채팅 세션 인터페이스
export interface IChatSession {
  id: string;
  messages: IMessage[];
  provider: AiProviderType;
}

// 채팅 메시지 인터페이스 - BaseMessage를 확장
export interface IChatMessage extends IBaseMessage {
  id: string;
  text: string;
  isUser: boolean;
  imagePreview?: ChatImagePreviewType;
}

// AI 응답 인터페이스 - BaseMessage를 확장하고 추가 속성 포함
export interface IAiResponse extends IBaseMessage {
  content: string;
  isValidJson?: boolean; // JSON 유효성
  isError: boolean;
  error?: string;
  errorCode?: string;
  model?: string;
  usage?: IBaseUsage;
  billing?: {
    ok: boolean;
    coins: number;
  };
  meta?: IAiResponseMeta;
}

export type ChatMessageMetaType = {
  clientId: string;
  translation?: string;
  timestamp: Date;
};
