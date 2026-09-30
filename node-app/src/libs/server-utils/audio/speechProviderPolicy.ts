import "server-only";

import {
  getDefaultSpeechModelName,
  getSpeechModelPolicy,
  type SpeechCapabilityType,
  type SpeechModelRoleType,
} from "consts/ai/speechModel";
import { isPreApprovalLockedModel } from "consts/ai/launchState";
import { resolveSpeechProviderGate } from "libs/server-utils/system/speechRuntimeControls";
import { createSpeechError } from "./guards";

/**
 * @docHint
 * @purpose speech provider/model/capability의 서버 권위 검증
 * @process catalog role/capability 확인  runtime gate 확인  provider 호출 허용 또는 차단
 * @domain speech
 * @scope server
 */

export function resolveSpeechModelName(args: {
  provider: string;
  modelName?: string;
  role: SpeechModelRoleType;
}) {
  const modelName = String(args.modelName || "").trim();
  return modelName || getDefaultSpeechModelName(args.provider, args.role);
}

export async function assertSpeechProviderCapabilityOrThrow(args: {
  provider: string;
  modelName?: string;
  role: SpeechModelRoleType;
  capability: SpeechCapabilityType;
}) {
  const provider = String(args.provider || "").trim().toLowerCase();
  const modelName = resolveSpeechModelName({ ...args, provider });
  const policy = getSpeechModelPolicy(provider, modelName);

  if (!policy || !policy.roles.includes(args.role) || !policy.capabilities.includes(args.capability)) {
    throw createSpeechError("요청한 speech 모델 또는 capability를 사용할 수 없습니다.", "UNSUPPORTED_SPEECH_MODEL", 400, {
      provider,
      modelName,
      role: args.role,
      capability: args.capability,
    });
  }

  if (isPreApprovalLockedModel(provider, modelName, "audio")) {
    throw createSpeechError("요청한 speech 모델은 승인 전 상태라 사용할 수 없습니다.", "SPEECH_MODEL_NOT_AVAILABLE", 503, {
      provider,
      modelName,
      role: args.role,
      readiness: policy.readiness,
    });
  }

  const { blockedReason } = await resolveSpeechProviderGate(provider);
  if (blockedReason) {
    throw createSpeechError("현재 speech provider가 활성화되어 있지 않습니다.", "SPEECH_MODEL_NOT_AVAILABLE", 503, {
      provider,
      modelName,
      blockedReason,
    });
  }

  return { provider, modelName, policy };
}

/**
 * 미승인 OpenAI/Qwen 후보에 대한 부작용 없는 사전 차단.
 * 기존 OpenAI 경로의 runtime-control 조회 방식은 바꾸지 않고 후보만 fail-closed로 둔다.
 */
export function assertSpeechCandidatePreApprovalGateOrThrow(args: { provider: string; modelName: string }) {
  const provider = String(args.provider || "").trim().toLowerCase();
  const modelName = String(args.modelName || "").trim();
  if (!isPreApprovalLockedModel(provider, modelName, "audio")) return;
  throw createSpeechError("요청한 speech 모델은 승인 전 상태라 사용할 수 없습니다.", "SPEECH_MODEL_NOT_AVAILABLE", 503, {
    provider,
    modelName,
    readiness: getSpeechModelPolicy(provider, modelName)?.readiness,
  });
}
