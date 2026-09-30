import type { AiProviderType, TextProviderType } from "types/ai";
import { normalizeAiProvider, normalizeTextProvider } from "utils/ai/providerHelper";
import { toUnknownRecord } from "utils/common";

// errorCode/status를 부착할 수 있는 Error 확장 타입
type CodedError = Error & { errorCode?: string; status?: number };

function codedError(message: string, errorCode: string, status = 400): CodedError {
  const err: CodedError = new Error(message);
  err.errorCode = errorCode;
  err.status = status;
  return err;
}

// 통합 AI 프로바이더
export function resolveProviderOrThrow(data: unknown, fallback?: AiProviderType): AiProviderType {
  const record = toUnknownRecord(data);
  const options = toUnknownRecord(record.options);
  const p = normalizeAiProvider(record.provider || options.provider);
  if (p) return p;
  if (fallback) return fallback;

  throw codedError("provider is required", "PROVIDER_REQUIRED", 400);
}

// 텍스트 전용: (photoroom 등 이미지 전용 차단)
export function resolveTextProviderOrThrow(data: unknown, fallback?: TextProviderType): TextProviderType {
  const record = toUnknownRecord(data);
  const options = toUnknownRecord(record.options);
  const providerInput = record.provider || options.provider;

  const p = normalizeTextProvider(providerInput);
  if (p) return p;
  if (fallback) return fallback;

  // AiProvider로는 유효하지만 TextProvider가 아닌 경우
  const raw = normalizeAiProvider(providerInput);
  if (raw) {
    throw codedError(`provider '${raw}'은(는) 텍스트 채팅을 지원하지 않습니다.`, "PROVIDER_NOT_TEXT", 400);
  }

  throw codedError("provider is required", "PROVIDER_REQUIRED", 400);
}
