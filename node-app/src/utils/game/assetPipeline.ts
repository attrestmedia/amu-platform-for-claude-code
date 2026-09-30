import {
  SPRITE_PIPELINE_STEP_KEYS,
  type GameAssetPipelineFailureKindType,
  type GameAssetPipelineAnchorType,
  type GameAssetPipelineStatusType,
  type GameAssetPipelineStepStateType,
  type IGameAssetPipelineDoc,
  type SpriteDirectionType,
  type SpritePipelineStepKeyType,
} from "types/game/asset-pipeline";
import { toErrorLike, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { getSpriteSheetProfile, getSpriteSheetProfileKey } from "consts/game/gameAssetTemplates";

/**
 * @docHint
 * @purpose 에셋 생성 파이프라인 v2의 순수 상태 머신 (서버 라우트/fixture 공유 — 전이 규칙 단일 정의)
 * @process 상태 전이 검증  step 실행 가능 판정(멱등/attempt 상한)  step 성공 후 상태 산출  멱등 키 소스/clientRequestId 빌더
 * @domain game.asset-pipeline
 * @scope global
 */

// D2 STEP4 계약: 최초 1회 + 재시도 1회
export const SPRITE_PIPELINE_MAX_STEP_ATTEMPTS = 2;
export const SPRITE_PIPELINE_FREE_VERIFY_RETRIES = 1;

const INFRASTRUCTURE_ERROR_CODE_PATTERN =
  /(?:^|_)(?:UPSTREAM|TIMEOUT|TIMED_OUT|NETWORK|RATE_LIMIT|SERVICE_UNAVAILABLE|GATEWAY|ECONN|ENET|EAI_AGAIN|SOCKET|STORAGE|R2|S3|REDIS|MONGODB|DATABASE)(?:_|$)/i;
const INFRASTRUCTURE_ERROR_MESSAGE_PATTERN =
  /\b(?:abort(?:ed)?|timed?\s*out|fetch failed|network error|socket hang up|econn(?:reset|refused)|eai_again|service unavailable|bad gateway|gateway timeout)\b/i;
const INFRASTRUCTURE_HTTP_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

export type PipelineStepFailureClassificationType = {
  kind: GameAssetPipelineFailureKindType;
  retryable: boolean;
  consumesAttempt: boolean;
};

// 알 수 없는 오류는 pipeline으로 보수 분류한다. 자동 무한 재시도 대신 관리자 reset으로 명시 복구한다.
export function classifyPipelineStepFailure(error: unknown): PipelineStepFailureClassificationType {
  const meta = toErrorLike(error);
  const errorCode = String(meta.errorCode || meta.code || "").trim();
  const message = String(meta.message || "").trim();
  const status = Number(meta.status || 0);
  const isInfrastructure =
    INFRASTRUCTURE_HTTP_STATUSES.has(status) ||
    INFRASTRUCTURE_ERROR_CODE_PATTERN.test(errorCode) ||
    INFRASTRUCTURE_ERROR_MESSAGE_PATTERN.test(message);

  return isInfrastructure
    ? { kind: "infrastructure", retryable: true, consumesAttempt: false }
    : { kind: "pipeline", retryable: false, consumesAttempt: true };
}

export function shouldWaiveSpriteVerificationRetry(step: GameAssetPipelineStepStateType | undefined) {
  return Boolean(
    SPRITE_PIPELINE_FREE_VERIFY_RETRIES > 0 &&
      step?.freeRetryEligible &&
      !step.freeRetryUsed &&
      Number(step.attempt || 0) > 1,
  );
}

// 상태 전이 맵 — 역방향 전이 금지, composed/failed는 종결 상태
export const GAME_ASSET_PIPELINE_TRANSITIONS: Record<GameAssetPipelineStatusType, GameAssetPipelineStatusType[]> = {
  draft: ["generating", "failed"],
  generating: ["post_processing", "failed"],
  post_processing: ["verifying", "failed"],
  verifying: ["composing", "verify_failed", "failed"],
  verify_failed: ["generating", "composing", "failed"],
  composing: ["composed", "failed"],
  composed: [],
  failed: [],
};

// 각 step을 실행할 수 있는 파이프라인 상태
export const SPRITE_PIPELINE_STEP_ALLOWED_STATUSES: Record<SpritePipelineStepKeyType, GameAssetPipelineStatusType[]> =
  {
    "step1-bible": ["draft", "generating"],
    "step2-base": ["draft", "generating", "verify_failed"],
    "step2-diagonal": ["draft", "generating", "verify_failed"],
    "step2-dir": ["verify_failed"],
    "step3-removebg": ["post_processing"],
    "step4-verify": ["verifying"],
    "step5-compose": ["composing"],
  };

// step 실행 착수 시 파이프라인이 전이할 상태
export const SPRITE_PIPELINE_STEP_RUNNING_STATUS: Record<SpritePipelineStepKeyType, GameAssetPipelineStatusType> = {
  "step1-bible": "generating",
  "step2-base": "generating",
  "step2-diagonal": "generating",
  "step2-dir": "verify_failed",
  "step3-removebg": "post_processing",
  "step4-verify": "verifying",
  "step5-compose": "composing",
};

export function canTransitionPipelineStatus(from: GameAssetPipelineStatusType, to: GameAssetPipelineStatusType) {
  if (from === to) return true;
  return (GAME_ASSET_PIPELINE_TRANSITIONS[from] || []).includes(to);
}

export function isStepAllowedForStatus(status: GameAssetPipelineStatusType, stepKey: SpritePipelineStepKeyType) {
  return (SPRITE_PIPELINE_STEP_ALLOWED_STATUSES[stepKey] || []).includes(status);
}

export type PipelineStepStartDecisionType = {
  ok: boolean;
  reason: "startable" | "already_running" | "already_succeeded" | "attempts_exhausted";
};

// 멱등 계약의 심장부: running/success는 재실행 금지(dedupe), attempt 상한 초과 금지
export function canStartPipelineStep(
  step: GameAssetPipelineStepStateType | undefined,
  maxAttempts: number = SPRITE_PIPELINE_MAX_STEP_ATTEMPTS,
): PipelineStepStartDecisionType {
  if (!step) return { ok: true, reason: "startable" };
  if (step.status === "running") return { ok: false, reason: "already_running" };
  if (step.status === "success") return { ok: false, reason: "already_succeeded" };
  if (Number(step.attempt || 0) >= maxAttempts) return { ok: false, reason: "attempts_exhausted" };
  return { ok: true, reason: "startable" };
}

// step 성공 직후 파이프라인 상태 산출 (STEP2는 base+diagonal 모두 성공해야 post_processing 진입)
export function resolveStatusAfterStepSuccess(
  stepKey: SpritePipelineStepKeyType,
  steps: Record<string, GameAssetPipelineStepStateType>,
): GameAssetPipelineStatusType {
  if (stepKey === "step1-bible") return "generating";
  if (stepKey === "step2-base" || stepKey === "step2-diagonal") {
    const other: SpritePipelineStepKeyType = stepKey === "step2-base" ? "step2-diagonal" : "step2-base";
    return steps[other]?.status === "success" ? "post_processing" : "generating";
  }
  if (stepKey === "step2-dir") return "verify_failed";
  if (stepKey === "step3-removebg") return "verifying";
  if (stepKey === "step4-verify") return "composing";
  return "composed";
}

// image_gen_jobs.request.clientRequestId 규약 — 잡↔파이프라인 step 상관키
export function buildPipelineStepClientRequestId(
  pipelineId: string,
  stepKey: string,
  attempt: number,
  resetCount: number = 0,
  direction?: string,
) {
  const directionSegment = String(direction || "").trim();
  const base = [
    String(pipelineId || "").trim(),
    String(stepKey || "").trim(),
    ...(directionSegment ? [directionSegment] : []),
    String(Math.max(1, Number(attempt || 1))),
  ].join(":");
  const normalizedResetCount = Math.max(0, Number(resetCount || 0));
  return normalizedResetCount > 0 ? `${base}:r${normalizedResetCount}` : base;
}

// 멱등 키의 해시 전 정규화 소스 (해시는 서버 유틸에서 수행)
export function buildSpritePipelineIdempotencySource(args: {
  uid: string;
  anchorRef?: string;
  anchor?: GameAssetPipelineAnchorType;
  templateVersion: number;
  variantKey?: string;
}) {
  const uid = String(args.uid || "").trim();
  const anchorRef = String(args.anchorRef || resolveSpritePipelineAnchorRef(args.anchor)).trim().toLowerCase();
  const version = Math.max(1, Number(args.templateVersion || 1));
  const variantKey = String(args.variantKey || "walk")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "walk";
  return `sprite-v2|${uid}|${anchorRef}|${variantKey}|v${version}`;
}

export function resolveSpritePipelineAnchorRef(anchor: GameAssetPipelineAnchorType | null | undefined) {
  return String(
    anchor?.bible?.sha256 ||
      anchor?.sha256 ||
      anchor?.bible?.assetId ||
      anchor?.imageAssetId ||
      anchor?.sourceUrl ||
      "",
  ).trim();
}

export function resolveSpritePipelineAnchorAssetId(anchor: GameAssetPipelineAnchorType | null | undefined) {
  return String(anchor?.bible?.assetId || anchor?.imageAssetId || "").trim();
}

// 현재 상태에서 실행 가능한 다음 step 산출 — 서버 eligibility와 동일 규칙 공유 (UI 제안용)
export function resolveNextPipelineStep(pipeline: {
  status: GameAssetPipelineStatusType;
  steps?: Record<string, GameAssetPipelineStepStateType>;
  anchor?: GameAssetPipelineAnchorType;
  directions?: IGameAssetPipelineDoc["directions"];
}): SpritePipelineStepKeyType | null {
  const requiresBible = Object.prototype.hasOwnProperty.call(pipeline.steps || {}, "step1-bible");
  if (
    requiresBible &&
    pipeline.steps?.["step1-bible"]?.status === "success" &&
    !pipeline.anchor?.bible?.confirmedAt
  ) {
    return null;
  }
  for (const stepKey of SPRITE_PIPELINE_STEP_KEYS) {
    if (stepKey === "step1-bible" && !requiresBible) continue;
    if (stepKey === "step2-dir" && resolveDirectionRegenPlan({ directions: pipeline.directions || {} }).length === 0) {
      continue;
    }
    if (!isStepAllowedForStatus(pipeline.status, stepKey)) continue;
    if (canStartPipelineStep(pipeline.steps?.[stepKey]).ok) return stepKey;
  }
  return null;
}

// D1 rowOrder 기준 방향 → 소스 step 매핑 (row 0~3 = base 시트, row 4~7 = diagonal 시트)
export const SPRITE_BASE_DIRECTIONS = ["down", "up", "left", "right"] as const;
export const SPRITE_DIAGONAL_DIRECTIONS = ["down-left", "up-left", "up-right", "down-right"] as const;
export const SPRITE_GENERATION_DIRECTIONS = ["down", "down-right", "up", "up-left", "up-right"] as const;
export const SPRITE_MIRROR_PAIRS = {
  right: "down",
  left: "up",
  "down-left": "up-right",
} as const satisfies Partial<Record<SpriteDirectionType, SpriteDirectionType>>;

export function resolveDirectionSourceStep(direction: string): SpritePipelineStepKeyType | null {
  if ((SPRITE_BASE_DIRECTIONS as readonly string[]).includes(direction)) return "step2-base";
  if ((SPRITE_DIAGONAL_DIRECTIONS as readonly string[]).includes(direction)) return "step2-diagonal";
  return null;
}

// 실패 방향 집합 → 재생성(리셋) 대상 step 집합 (부분 재생성 최소 단위 = 호출 시트)
export function resolveFailedSourceStepKeys(failedDirections: string[]): SpritePipelineStepKeyType[] {
  const steps = new Set<SpritePipelineStepKeyType>();
  for (const direction of failedDirections || []) {
    const step = resolveDirectionSourceStep(direction);
    if (step) steps.add(step);
  }
  return Array.from(steps);
}

export function resolveDirectionRegenPlan(pipeline: Pick<IGameAssetPipelineDoc, "directions">) {
  return Object.entries(pipeline.directions || {})
    .filter(([, rawState]) => {
      const state = toUnknownRecord(rawState);
      const regen = toUnknownRecord(state.regen);
      return (
        String(state.status || "") === "failed" &&
        String(regen.status || "pending") !== "running" &&
        Number(regen.attempt || 0) < Math.max(1, Number(regen.maxAttempts || SPRITE_PIPELINE_MAX_STEP_ATTEMPTS))
      );
    })
    .map(([direction]) => direction as SpriteDirectionType);
}

export function canMirrorSpriteDirection(args: {
  pipeline: Pick<IGameAssetPipelineDoc, "anchor" | "variables" | "directions">;
  targetDirection: SpriteDirectionType;
}) {
  const sourceDirection = SPRITE_MIRROR_PAIRS[args.targetDirection as keyof typeof SPRITE_MIRROR_PAIRS];
  if (!sourceDirection || args.pipeline.anchor?.bible?.symmetry !== "symmetric") return false;
  const variables = normalizeSpriteActionVariables(args.pipeline.variables);
  if (variables.motion_loop_value !== "true" || variables.symmetry_eligible !== "true") return false;
  return String(args.pipeline.directions?.[sourceDirection]?.status || "") === "passed";
}

export function buildSpritePipelineVariantKey(value: UnknownRecord | undefined) {
  const variables = normalizeSpriteActionVariables(value);
  const profileSuffix = variables.sprite_sheet_profile === "v2" ? "" : `:${variables.sprite_sheet_profile}`;
  const base = `${variables.sprite_action_key}${profileSuffix}:guide-v${variables.motion_guide_version}`;
  // CK-503: chroma_key_preset이 magenta면 기존 variant 키 유지 (하위 호환),
  // green/blue는 suffix 추가해 별도 variant로 분기
  const chromaSuffix =
    variables.chroma_key_preset && variables.chroma_key_preset !== "magenta"
      ? `:key-${variables.chroma_key_preset}`
      : "";
  return `${base}${chromaSuffix}`;
}

export function normalizeSpriteActionVariables(value: UnknownRecord | undefined) {
  const source = toUnknownRecord(value);
  const actionKey = String(source.sprite_action_key || "walk")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "walk";
  const read = (key: string, fallback: string, maxLength: number) =>
    String(source[key] || fallback).trim().slice(0, maxLength) || fallback;
  const fps = Math.max(1, Math.min(24, Math.round(Number(source.motion_fps || 8) || 8)));
  const loop = String(source.motion_loop_value ?? source.motion_loop ?? "true").toLowerCase() !== "false";
  const symmetryEligible =
    loop && String(source.symmetry_eligible ?? (actionKey === "walk" ? "true" : "false")).toLowerCase() === "true";
  const motionGuideVersion = Math.max(0, Math.min(1000, Math.round(Number(source.motion_guide_version || 0) || 0)));
  const profileKey = getSpriteSheetProfileKey(source.sprite_frame_count || source.sprite_sheet_profile);
  const profile = getSpriteSheetProfile(profileKey);
  const chromaKeyPreset = String(source.chroma_key_preset || "magenta").trim().toLowerCase();
  const validPresets = new Set(["green", "blue", "magenta"]);

  return {
    sprite_action_key: actionKey,
    sprite_action_label: read("sprite_action_label", actionKey === "walk" ? "걷기" : actionKey, 40),
    motion_action: read("motion_action", "natural isometric walking cycle", 240),
    motion_sequence: read("motion_sequence", "idle contact, step 1, opposite contact, step 2", 320),
    motion_loop: read(
      "motion_loop",
      loop
        ? "seamless loop; the last pose must flow naturally back to the first pose"
        : "one-shot action; show a clear start, peak, and recovery without forcing a loop",
      240,
    ),
    motion_loop_value: loop ? "true" : "false",
    symmetry_eligible: symmetryEligible ? "true" : "false",
    motion_fps: String(fps),
    motion_guide_version: String(motionGuideVersion),
    sprite_frame_count: String(profile.frameCount),
    sprite_sheet_profile: profileKey,
    chroma_key_preset: validPresets.has(chromaKeyPreset) ? chromaKeyPreset : "magenta",
  };
}
