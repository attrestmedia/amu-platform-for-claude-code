export type StageReleaseStatus = "prepared" | "active";

export interface IStageReleaseObjectRef {
  key: string;
  url: string;
  bytes: number;
  sha256: string;
  mimeType: string;
}

export interface IStageReleaseAssetRef extends IStageReleaseObjectRef {
  sourceRef: string;
}

export interface IStageReleaseManifest {
  schemaVersion: 1;
  manifestVersion: string;
  releaseId: string;
  universeId: string;
  stageId: string;
  stageName: string;
  coordinateContractVersion: 2;
  createdAt: string;
  stageDoc: IStageReleaseObjectRef;
  assets: IStageReleaseAssetRef[];
}

export interface IStageReleasePointer {
  schemaVersion: 1;
  status: "active";
  universeId: string;
  stageId: string;
  stageName: string;
  releaseId: string;
  manifestVersion: string;
  manifestKey: string;
  manifestUrl: string;
  manifestSha256: string;
  stageDocKey: string;
  stageDocSha256: string;
  activatedAt: string;
}

export interface IStageReleaseDeployment {
  schemaVersion: 1;
  status: StageReleaseStatus;
  universeId: string;
  releaseId: string;
  manifestVersion: string;
  manifestKey: string;
  manifestUrl: string;
  manifestSha256: string;
  stageDocKey: string;
  stageDocSha256: string;
  coordinateContractVersion: 2;
  preparedAt: string;
  activatedAt?: string;
}

export type StageBrowserFamily = "chromium" | "firefox" | "webkit";

export interface IStageBrowserReleaseObservation {
  observationId: string;
  observedAt: string;
  universeId: string;
  stageId: string;
  manifestVersion: string;
  coordinateContractVersion: number;
  browserFamily: StageBrowserFamily;
  initialized: boolean;
  runtimeReady: boolean;
  fatalRuntimeErrors: number;
  moved: boolean;
  npcTalked: boolean;
  explored: boolean;
  reentered: boolean;
  resized: boolean;
  initializationMs: number;
  frameP95Ms: number;
}

export interface IStageBrowserReleaseGatePolicy {
  requiredBrowsers: StageBrowserFamily[];
  maxInitializationMs: number;
  maxFrameP95Ms: number;
}

export interface IStageBrowserReleaseGateResult {
  passed: boolean;
  checkedAt: string;
  observationCount: number;
  missingBrowsers: StageBrowserFamily[];
  failures: Array<{ observationId: string; code: string; message: string }>;
}
