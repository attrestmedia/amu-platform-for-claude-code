import fetchClient from "libs/api/fetchClient";
import type { IGameAssetPipelineDoc, SpriteDirectionPricingQuoteType } from "types/game";

/**
 * @docHint
 * @purpose 8방향 스프라이트 파이프라인 v2 admin API 클라이언트 (멱등 생성/폴링/step 실행)
 * @process fetchClient 경유 요청  응답 ok 검증  파이프라인 문서 반환
 * @domain game.asset-pipeline
 * @scope admin-client
 */

type PipelineCreateResponse = {
  ok: boolean;
  data?: { pipeline: IGameAssetPipelineDoc; created: boolean };
  error?: string;
};

type PipelineListResponse = {
  ok: boolean;
  data?: IGameAssetPipelineDoc[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  error?: string;
};

type PipelineGetResponse = {
  ok: boolean;
  data?: IGameAssetPipelineDoc;
  error?: string;
};

type PipelineStepResponse = {
  ok: boolean;
  data?: { pipeline: IGameAssetPipelineDoc; deduped: boolean; reason?: string };
  error?: string;
  errorCode?: string;
};

export async function createSpritePipeline(input: {
  anchorImageAssetId?: string;
  anchorSourceUrl?: string;
  name?: string;
  variables?: Record<string, string>;
}) {
  const res = await fetchClient.post<PipelineCreateResponse>("/game/assets/pipeline", input);
  if (!res.data.ok || !res.data.data) throw new Error(res.data.error || "파이프라인 생성에 실패했습니다.");
  return res.data.data;
}

export async function listSpritePipelines(params?: { kind?: string; status?: string; page?: number; pageSize?: number }) {
  const res = await fetchClient.get<PipelineListResponse>("/game/assets/pipeline", { params });
  if (!res.data.ok) throw new Error(res.data.error || "파이프라인 목록 조회에 실패했습니다.");
  return res.data;
}

export async function getSpritePipeline(pipelineId: string) {
  const res = await fetchClient.get<PipelineGetResponse>(`/game/assets/pipeline/${encodeURIComponent(pipelineId)}`);
  if (!res.data.ok || !res.data.data) throw new Error(res.data.error || "파이프라인 조회에 실패했습니다.");
  return res.data.data;
}

export async function runSpritePipelineStep(
  pipelineId: string,
  stepKey: string,
  options?: { direction?: string; mirrorConfirmed?: boolean },
) {
  const res = await fetchClient.post<PipelineStepResponse>(
    `/game/assets/pipeline/${encodeURIComponent(pipelineId)}/steps`,
    { stepKey, ...options },
  );
  if (!res.data.ok || !res.data.data) {
    const err = new Error(res.data.error || "파이프라인 step 실행에 실패했습니다.") as Error & { errorCode?: string };
    err.errorCode = res.data.errorCode;
    throw err;
  }
  return res.data.data;
}

export async function getSpriteDirectionPricingQuote(pipelineId: string) {
  const res = await fetchClient.get<{ ok: boolean; data?: SpriteDirectionPricingQuoteType; error?: string }>(
    `/game/assets/pipeline/${encodeURIComponent(pipelineId)}/steps`,
    { cache: "no-store" },
  );
  if (!res.data.ok || !res.data.data) throw new Error(res.data.error || "방향 재생성 견적을 불러오지 못했습니다.");
  return res.data.data;
}
