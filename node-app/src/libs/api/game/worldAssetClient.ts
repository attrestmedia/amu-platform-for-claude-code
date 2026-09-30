import fetchClient from "libs/api/fetchClient";
import type { IGameAssetDoc } from "types/game";
import type { IPaginationInfo } from "types/data";

export type WorldAssetGenerationQuote = {
  categoryKey: string;
  presetKey: string;
  pricingRole: "play.world_asset.generate";
  quotedCoins: number;
  count: 1;
  provider: string;
  modelName: string;
  billingStrategy: "fixed" | "token" | "hybrid";
  pricingRevision: string;
  source: "system-pricing";
};

export type WorldAssetGenerationResult = {
  asset: IGameAssetDoc;
  quote: WorldAssetGenerationQuote;
  replayed: boolean;
};

type WorldAssetListResponse = {
  ok: boolean;
  data: IGameAssetDoc[];
  pagination: IPaginationInfo;
  error?: string;
};

export async function listWorldAssets(params?: {
  universeId?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  const res = await fetchClient.get<WorldAssetListResponse>("/game/world-assets", { params });
  if (!res.data.ok) throw new Error(res.data.error || "월드 에셋 목록을 불러오지 못했습니다.");
  return res.data;
}

export async function getWorldAssetGenerationQuote(params: { categoryKey: string; presetKey: string }) {
  const res = await fetchClient.get<{ ok: boolean; data: WorldAssetGenerationQuote; error?: string }>(
    "/game/world-assets",
    { params: { categoryKey: params.categoryKey, presetKey: params.presetKey } },
  );
  if (!res.data.ok) throw new Error(res.data.error || "월드 에셋 생성 견적을 확인하지 못했습니다.");
  return res.data.data;
}

export async function createWorldAsset(payload: {
  universeId: string;
  categoryKey: string;
  presetKey: string;
  name?: string;
  clientRequestId: string;
}) {
  const res = await fetchClient.post<{ ok: boolean; data: WorldAssetGenerationResult; error?: string }>(
    "/game/world-assets",
    payload,
    { timeout: 180_000 },
  );
  if (!res.data.ok) throw new Error(res.data.error || "월드 에셋을 생성하지 못했습니다.");
  return res.data.data;
}
