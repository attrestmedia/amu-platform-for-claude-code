/**
 * @docHint
 * @purpose 모델별 출시 상태(launchState) 코드 정책 선언과 enabled/adminOnly 파생
 * @process 출시 상태 조회  enabled/adminOnly 파생
 * @domain ai
 * @scope shared
 */

import { getSpeechModelLaunchState } from "./speechModel";
import { AI_INTERNAL_LAUNCH_STATE } from "./generated/modelCatalog.generated";
import type { AssertAssignable } from "./catalogShapeAssertion";


export const MODEL_LAUNCH_STATES = ["internal", "admin_only", "public"] as const;
export type ModelLaunchStateType = (typeof MODEL_LAUNCH_STATES)[number];

export type LaunchStateCanonicalShape = [
  AssertAssignable<typeof AI_INTERNAL_LAUNCH_STATE, Record<string, ModelLaunchStateType>>,
];

/**
 * 코드 정책의 출시 상태 SSOT. 미등록 키는 "public".
 * - "internal": off (enabled=false, adminOnly=true). 사용자·관리자 모두 선택 불가.
 * - "admin_only": 운영·관리자만 선택 (enabled=true, adminOnly=true).
 * - "public": 일반 사용자 선택 가능 (enabled=true, adminOnly=false).
 *
 * video modality는 catalog-only(실행 job 미구현)라 전체 "internal"로 귀속한다.
 * 개별 모델의 internal 선언은 아래 키로 명시한다.
 *
 * 2026-09-06 MCG-100: provider 이름("zai") 하드코딩을 이 선언으로 대체한다.
 * glm-5.3-flash는 운영에서 이미 public + 정책 기본(AI_DEFAULT_TEXT_MODEL_BY_PROVIDER.zai)이므로 public.
 * 2026-09-06 MCG-301: glm-5.3(non-flash) 공개 전환을 사용자 승인으로 확정 → internal 제거(public).
 * 2026-09-29: glm-image 공개 전환을 사용자 요청으로 확정 → internal 제거(public).
 * 정책 기본(AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER.zai)이 비공개라 G-MCG-01 불변식이 위반되던 상태를 해소한다.
 * cogvideox-3는 video 전체 internal로 귀속된다.
 */
/**
 * 미승인 후보는 catalog DB의 enabled/adminOnly override로도 열지 않는다.
 * E 승인 로스터는 이 목록에서 해제하고, 아직 미승인인 신규 후보만 여기에 추가한다.
 */
const PRE_APPROVAL_LOCKED_MODEL_KEYS = new Set<string>();

export function isPreApprovalLockedModel(provider: string, modelName: string, modality: string): boolean {
  return PRE_APPROVAL_LOCKED_MODEL_KEYS.has(launchStateKey(provider, modelName, modality));
}

function launchStateKey(provider: string, modelName: string, modality: string) {
  return `${String(provider || "").trim().toLowerCase()}:${String(modelName || "").trim()}:${modality}`;
}

export function getModelLaunchState(
  provider: string,
  modelName: string,
  modality: string,
): ModelLaunchStateType {
  if (isPreApprovalLockedModel(provider, modelName, modality)) return "internal";
  if (modality === "video") return "internal";
  // EL-202: audio는 코드 정책(speechModel.ts)이 모델별로 선언한다.
  // 미등록 audio 모델은 fail-closed로 internal이며 public 폴백을 적용하지 않는다.
  if (modality === "audio") return getSpeechModelLaunchState(provider, modelName);
  return (AI_INTERNAL_LAUNCH_STATE as Record<string, ModelLaunchStateType>)[launchStateKey(provider, modelName, modality)] ?? "public";
}

/**
 * launchState → 저장 필드(enabled/adminOnly) 파생. MCG-000 계약 §1.3 쓰기 사상과 일치한다.
 * - public → enabled=true, adminOnly=false
 * - admin_only → enabled=true, adminOnly=true
 * - internal → enabled=false, adminOnly=true
 */
export function launchStateToEnabledAdminOnly(state: ModelLaunchStateType) {
  return {
    enabled: state !== "internal",
    adminOnly: state !== "public",
  };
}

/**
 * 저장 필드(enabled/adminOnly) → launchState 파생. MCG-000 계약 §1.3 읽기 사상과 일치한다.
 * - enabled=false → internal (adminOnly 값 무관)
 * - enabled=true, adminOnly=true → admin_only
 * - enabled=true, adminOnly=false → public
 */
export function enabledAdminOnlyToLaunchState(enabled: boolean, adminOnly: boolean): ModelLaunchStateType {
  if (!enabled) return "internal";
  return adminOnly ? "admin_only" : "public";
}
