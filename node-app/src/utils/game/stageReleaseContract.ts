import type {
  IStageBrowserReleaseGatePolicy,
  IStageBrowserReleaseGateResult,
  IStageBrowserReleaseObservation,
  IStageDoc,
  StageBrowserFamily,
} from "types/game";

/**
 * @docHint
 * @purpose v2 Stage release 미디어 수집과 일반 브라우저 출시 게이트의 순수 계약
 * @process StageDoc 미디어 참조 수집  브라우저 관측 판정
 * @domain game-stage-release
 * @scope shared
 */

export const DEFAULT_STAGE_BROWSER_RELEASE_GATE_POLICY: IStageBrowserReleaseGatePolicy = {
  requiredBrowsers: ["chromium", "firefox"],
  maxInitializationMs: 5_000,
  maxFrameP95Ms: 34,
};

export function collectStageMediaRefs(doc: Pick<IStageDoc, "background" | "border" | "assets">): string[] {
  const refs: string[] = [];
  if (doc.background?.name) refs.push(doc.background.name);
  for (const value of Object.values(doc.border ?? {})) {
    if (value) refs.push(value);
  }
  for (const asset of doc.assets ?? []) {
    if (asset.fileName) refs.push(asset.fileName);
    for (const state of asset.meta?.states ?? []) {
      if (state.fileName) refs.push(state.fileName);
    }
  }
  return Array.from(new Set(refs));
}

function addObservationFailure(
  failures: IStageBrowserReleaseGateResult["failures"],
  observation: IStageBrowserReleaseObservation,
  code: string,
  message: string,
): void {
  failures.push({ observationId: observation.observationId, code, message });
}

export function evaluateStageBrowserReleaseGate(
  observations: IStageBrowserReleaseObservation[],
  policy: IStageBrowserReleaseGatePolicy = DEFAULT_STAGE_BROWSER_RELEASE_GATE_POLICY,
  checkedAt = new Date().toISOString(),
): IStageBrowserReleaseGateResult {
  const failures: IStageBrowserReleaseGateResult["failures"] = [];
  const observedBrowsers = new Set<StageBrowserFamily>();
  const releaseVersions = new Set<string>();

  for (const observation of observations) {
    observedBrowsers.add(observation.browserFamily);
    releaseVersions.add(observation.manifestVersion);
    if (!observation.initialized || !observation.runtimeReady) {
      addObservationFailure(failures, observation, "STAGE_BROWSER_RUNTIME_NOT_READY", "initialized/runtimeReady must be true");
    }
    if (observation.coordinateContractVersion !== 2) {
      addObservationFailure(failures, observation, "STAGE_BROWSER_COORDINATE_VERSION_INVALID", "coordinate contract v2 is required");
    }
    if (observation.fatalRuntimeErrors !== 0) {
      addObservationFailure(failures, observation, "STAGE_BROWSER_FATAL_RUNTIME_ERROR", "fatal runtime error count must be zero");
    }
    if (!observation.moved || !observation.npcTalked || !observation.explored || !observation.reentered || !observation.resized) {
      addObservationFailure(
        failures,
        observation,
        "STAGE_BROWSER_SCENARIO_INCOMPLETE",
        "movement, NPC talk, exploration, re-entry, and resize scenarios must all pass",
      );
    }
    if (!Number.isFinite(observation.initializationMs) || observation.initializationMs > policy.maxInitializationMs) {
      addObservationFailure(
        failures,
        observation,
        "STAGE_BROWSER_INITIALIZATION_BUDGET_EXCEEDED",
        `initialization must be <= ${policy.maxInitializationMs}ms`,
      );
    }
    if (!Number.isFinite(observation.frameP95Ms) || observation.frameP95Ms > policy.maxFrameP95Ms) {
      addObservationFailure(
        failures,
        observation,
        "STAGE_BROWSER_FRAME_BUDGET_EXCEEDED",
        `frame p95 must be <= ${policy.maxFrameP95Ms}ms`,
      );
    }
  }

  if (releaseVersions.size > 1) {
    failures.push({
      observationId: "release-set",
      code: "STAGE_BROWSER_MANIFEST_VERSION_MISMATCH",
      message: "all observations must target the same manifest version",
    });
  }

  const missingBrowsers = policy.requiredBrowsers.filter((browser) => !observedBrowsers.has(browser));
  return {
    passed: observations.length > 0 && missingBrowsers.length === 0 && failures.length === 0,
    checkedAt,
    observationCount: observations.length,
    missingBrowsers,
    failures,
  };
}
