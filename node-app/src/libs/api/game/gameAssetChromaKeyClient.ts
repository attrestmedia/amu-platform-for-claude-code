import fetchClient from "libs/api/fetchClient";
import type { ChromaKeyOptionsType, ChromaKeyQualityType } from "types/game/chroma-key";
import type { QualityEvaluationType } from "utils/game/chromaKeyQuality";
import type { IGameAssetDoc } from "types/game";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChromaKeyApplyAction = "local-only" | "ai-fallback";

export type ChromaKeyApplyRequest = {
  gameAssetId: string;
  action: ChromaKeyApplyAction;
  options: ChromaKeyOptionsType;
  expectedSourceSha?: string;
};

export type ChromaKeyApplyResponse = {
  ok: boolean;
  data?: {
    gameAssetId: string;
    sourceSha256: string;
    outputSha256: string;
    method: string;
    quality: ChromaKeyQualityType;
    evaluation: QualityEvaluationType;
    processingTimeMs: number;
    coins: number;
    fallbackReason?: string;
    engineVersion: string;
    geometry: { valid: boolean; issues?: string[] };
    sourceWidth: number;
    sourceHeight: number;
    tempResult: {
      storageKey: string;
      url: string;
      width: number;
      height: number;
      bytes: number;
    };
  };
  error?: string;
  errorCode?: string;
  details?: string;
};

export type ChromaKeyCommitRequest = {
  gameAssetId: string;
  tempStorageKey: string;
  sourceSha256: string;
  outputSha256: string;
  options: ChromaKeyOptionsType;
  method: string;
  engineVersion?: string;
  quality?: ChromaKeyQualityType;
  evaluation?: QualityEvaluationType;
  inputWidth?: number;
  inputHeight?: number;
};

export type ChromaKeyCommitResponse = {
  ok: boolean;
  data?: {
    gameAssetId: string;
    storage: IGameAssetDoc["storage"];
    meta: IGameAssetDoc["meta"];
    asset: IGameAssetDoc;
  };
  error?: string;
  errorCode?: string;
};

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * 서버에서 크로마키를 적용하고 임시 결과를 반환한다.
 * local-only: 0코인, v2 엔진만 실행
 * ai-fallback: 로컬 실패 시 유료 AI provider 호출
 */
export async function applyChromaKey(
  payload: ChromaKeyApplyRequest,
): Promise<ChromaKeyApplyResponse> {
  const res = await fetchClient.post<ChromaKeyApplyResponse>(
    "/game/assets/chroma-key/apply",
    payload,
  );
  if (!res.data.ok) {
    throw new Error(res.data.error || "크로마키 적용에 실패했습니다.");
  }
  return res.data;
}

/**
 * 크로마키 결과를 R2에 영구 저장하고 GameAsset DB를 갱신한다.
 */
export async function commitChromaKey(
  payload: ChromaKeyCommitRequest,
): Promise<ChromaKeyCommitResponse> {
  const res = await fetchClient.post<ChromaKeyCommitResponse>(
    "/game/assets/chroma-key/commit",
    payload,
  );
  if (!res.data.ok) {
    throw new Error(res.data.error || "크로마키 결과 저장에 실패했습니다.");
  }
  return res.data;
}
