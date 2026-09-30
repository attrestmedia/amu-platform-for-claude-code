/**
 * ChromaKey v2 — engine mode resolution (CK-003)
 *
 * 모드별로 어떤 엔진을 사용하고 결과를 어디에 반영할지 결정한다.
 * mode 전환은 더 제한적인 방향으로만 허용되며, DB migration 없이 즉시 롤백 가능하다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope server
 */
import type { EngineModeType, EngineModeConfigType, CanaryTargetType } from "types/game/chroma-key";
import {
  ENGINE_MODE_DEFAULT,
  ENGINE_MODE_CONFIGS,
  isCanaryTarget,
  isValidModeTransition,
} from "consts/game/chromaKeyPresets";

// ---------------------------------------------------------------------------
// Runtime mode holder (server-only, process-scoped singleton)
// ---------------------------------------------------------------------------

let _currentMode: EngineModeType = ENGINE_MODE_DEFAULT;
let _canaryConfig: CanaryTargetType = { uidAllowlist: [], pipelineAllowlist: [] };

/** 현재 엔진 모드 반환 */
export function getEngineMode(): EngineModeType {
  return _currentMode;
}

/** 현재 엔진 모드 설정 (전이 검증 포함) */
export function setEngineMode(mode: EngineModeType): void {
  if (!isValidModeTransition(_currentMode, mode)) {
    throw new Error(`Invalid mode transition: ${_currentMode} → ${mode}`);
  }
  _currentMode = mode;
}

/** canary 설정 업데이트 */
export function setCanaryConfig(config: CanaryTargetType): void {
  _canaryConfig = { ...config };
}

/** 현재 canary 설정 반환 (깊은 복사) */
export function getCanaryConfig(): CanaryTargetType {
  return {
    uidAllowlist: _canaryConfig.uidAllowlist ? [..._canaryConfig.uidAllowlist] : undefined,
    pipelineAllowlist: _canaryConfig.pipelineAllowlist ? [..._canaryConfig.pipelineAllowlist] : undefined,
  };
}

// ---------------------------------------------------------------------------
// Mode-aware engine selection
// ---------------------------------------------------------------------------

/** 현재 모드의 config 반환 */
export function getEngineModeConfig(mode?: EngineModeType): EngineModeConfigType {
  return ENGINE_MODE_CONFIGS[mode ?? _currentMode];
}

/**
 * 주어진 uid/pipelineId에 대해 현재 응답에 사용할 엔진을 결정한다.
 *
 * - legacy: 항상 legacy
 * - shadow: legacy로 응답하지만 v2 메타 포함
 * - canary: allowlist에 있으면 v2, 아니면 legacy
 * - enabled: 항상 v2
 */
export function resolveActiveEngine(
  uid: string,
  pipelineId?: string,
): { primaryEngine: "legacy" | "v2"; responseEngine: "legacy" | "v2"; mode: EngineModeType } {
  const mode = _currentMode;
  const config = ENGINE_MODE_CONFIGS[mode];

  // canary 모드: 런타임 _canaryConfig로 allowlist 검사
  if (mode === "canary") {
    if (!isCanaryTarget(uid, pipelineId, _canaryConfig)) {
      return { primaryEngine: "legacy", responseEngine: "legacy", mode };
    }
  }

  return { primaryEngine: config.primaryEngine, responseEngine: config.responseEngine, mode };
}

/**
 * v2 shadow 결과를 병렬 계산해야 하는지 여부.
 * shadow 모드이거나, canary 모드에서 특정 대상이 아닌 경우에도
 * 모니터링 목적으로 shadow 계산을 수행할 수 있다.
 */
export function shouldComputeV2Shadow(): boolean {
  return ENGINE_MODE_CONFIGS[_currentMode].computeV2Shadow;
}

/** v2 결과를 저장소에 기록해야 하는지 */
export function shouldStoreV2Result(): boolean {
  return ENGINE_MODE_CONFIGS[_currentMode].storeV2Result;
}

/** v2 메타를 응답에 포함해야 하는지 */
export function shouldIncludeV2Meta(): boolean {
  return ENGINE_MODE_CONFIGS[_currentMode].includeV2Meta;
}

// ---------------------------------------------------------------------------
// Rollback helpers
// ---------------------------------------------------------------------------

/**
 * 즉시 롤백 — 현재 모드를 legacy로 되돌린다.
 * DB migration 불필요, v2 meta는 optional이므로 legacy가 읽지 않는다.
 */
export function rollbackToLegacy(): void {
  _currentMode = "legacy";
  _canaryConfig = { uidAllowlist: [], pipelineAllowlist: [] };
}

/** shadow로 롤백 (canary/enabled에서 한 단계 내림) */
export function rollbackToShadow(): void {
  _currentMode = "shadow";
}

/** 테스트 목적으로 모드 리셋 */
export function resetEngineMode(): void {
  _currentMode = ENGINE_MODE_DEFAULT;
  _canaryConfig = { uidAllowlist: [], pipelineAllowlist: [] };
}
