/**
 * @docHint
 * @purpose 빈 텍스트 응답 오류에서 안전하게 보존된 provider token usage를 판별한다
 * @process 오류 코드와 usage 필드를 검증해 input/output token 수 또는 null을 반환한다
 * @domain ai-provider
 * @scope shared-error-contract
 */

import { toUnknownRecord } from "utils/common/typeUtils";

export function safeNonNegativeTokenCount(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function readEmptyTextUsage(error: unknown): { input: number; output: number } | null {
  const record = toUnknownRecord(error);
  if (record.errorCode !== "EMPTY_TEXT_RESPONSE" && record.errorCode !== "OUTPUT_TOKEN_LIMIT_REACHED") return null;
  const usage = toUnknownRecord(record.usageTotal);
  const input = safeNonNegativeTokenCount(usage.input);
  const output = safeNonNegativeTokenCount(usage.output);
  return input !== null && output !== null && input + output > 0 ? { input, output } : null;
}
