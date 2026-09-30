import "server-only";
import type {
  IPersona,
  RouteHintType,
  SpeechIntent,
  SpeechProviderType,
  SpeechVoiceSettings,
  ISpeechSynthesizeResponse,
  ISpeechVoiceProfile,
} from "types/ai";
import type { IUniverseMetadata } from "types/game/universe";
import type { IFixedUsage, ITokenUsageBreakdown } from "types/payment";

export type SpeechInputFormat = "flac" | "m4a" | "mp3" | "mp4" | "mpeg" | "mpga" | "ogg" | "wav" | "webm";
export type SpeechSynthesisFormat = "aac" | "flac" | "mp3" | "opus" | "pcm" | "wav";
export type SpeechVoiceResolutionSource = "catalog-auto" | "persona-profile" | "request-override";

export interface ISpeechAudioInput {
  buffer: Buffer | Uint8Array;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
}

export interface IValidatedSpeechAudioInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  actualDurationMs?: number;
  durationSource: "server" | "client" | "unavailable";
  format: SpeechInputFormat;
}

export interface ISpeechBillingContext {
  uid?: string;
  universeId?: string;
  routeHint?: RouteHintType;
  app?: string;
  billToUniverse?: boolean;
  skipCharge?: boolean;
  requireChargeContext?: boolean;
  meta?: Record<string, unknown>;
}

export interface ISpeechBillingResult {
  ok: boolean;
  coins: number;
  charged: boolean;
  estimated: boolean;
}

export interface IResolvedVoiceProfile extends ISpeechVoiceProfile {
  provider: SpeechProviderType;
  voiceId: string;
  modelName: string;
  source: SpeechVoiceResolutionSource;
  score: number;
  matchedTags: string[];
  matchedReasons: string[];
}

export type SpeechProviderCallState = "not_sent" | "completed" | "unknown_outcome";

export type SpeechProviderError = Error & {
  errorCode?: string;
  status?: number;
  providerCallState?: SpeechProviderCallState;
  providerRequestId?: string;
  upstreamStatus?: number;
};

export interface ISpeechTranscribeRequest {
  /** 대상 제한(EL-002) 판정용 서버 사용자 문서. 클라이언트가 채우는 값이 아니다. */
  user?: unknown;
  provider?: SpeechProviderType;
  modelName?: string;
  file: ISpeechAudioInput;
  language?: string;
  prompt?: string;
  maxDurationMs?: number;
  billing?: ISpeechBillingContext;
}

export interface ISpeechTranscribeProviderResult {
  transcript: string;
  language?: string;
  confidence?: number;
  fixedUsage?: IFixedUsage;
  usage?: ITokenUsageBreakdown;
  meta?: Record<string, unknown>;
}

export interface ISpeechPronunciationAssessment {
  provider: "openai";
  modelName: string;
  basis: "gpt_audio_direct";
  heardText?: string;
  detectedLanguage?: string;
  summary: string;
  overallScore?: number;
  clarityScore?: number;
  fluencyScore?: number;
  paceScore?: number;
  intonationScore?: number;
  strengths: string[];
  improvements: string[];
  uncertainWords: Array<{ word: string; issue?: string; suggestion?: string }>;
}

export interface ISpeechAudioAnalysisResult {
  assessment: ISpeechPronunciationAssessment;
  usage?: ITokenUsageBreakdown;
  billing: ISpeechBillingResult;
  meta?: Record<string, unknown>;
}

export interface ISpeechSynthesizeRequest {
  /** 대상 제한(EL-002) 판정용 서버 사용자 문서. 클라이언트가 채우는 값이 아니다. */
  user?: unknown;
  provider?: SpeechProviderType;
  modelName?: string;
  text: string;
  format?: SpeechSynthesisFormat;
  speed?: number;
  locale?: string;
  routeHint?: RouteHintType;
  persona?: Partial<IPersona> | null;
  universeMetadata?: IUniverseMetadata | null;
  voiceProfile?: Partial<IResolvedVoiceProfile> | null;
  speechIntent?: SpeechIntent;
  settings?: SpeechVoiceSettings;
  billing?: ISpeechBillingContext;
}

export interface ISpeechSynthesizeProviderResult {
  audioBuffer: Buffer;
  contentType: string;
  bytes: number;
  fixedUsage?: IFixedUsage;
  usage?: ITokenUsageBreakdown;
  meta?: Record<string, unknown>;
}

export type ISpeechSynthesizeServiceResult = ISpeechSynthesizeResponse & {
  audioBuffer: Buffer;
  bytes: number;
  resolvedVoice: IResolvedVoiceProfile;
};
