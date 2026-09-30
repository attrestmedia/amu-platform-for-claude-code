import fetchClient from "libs/api/fetchClient";
import type { GameAssetInventorySummaryType, IGameAssetDoc } from "types/game";
import type { PromptItemExtendedType } from "types/app";

type GameAssetTemplatesResponse = {
  ok: boolean;
  templates: PromptItemExtendedType[];
  registered: PromptItemExtendedType[];
  error?: string;
};

type GameAssetListResponse = {
  ok: boolean;
  data: IGameAssetDoc[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  inventory: GameAssetInventorySummaryType;
  error?: string;
};

type GameAssetMutationResponse = {
  ok: boolean;
  data?: IGameAssetDoc;
  error?: string;
};

export async function listGameAssetTemplates() {
  const res = await fetchClient.get<GameAssetTemplatesResponse>("/game/assets/templates");
  if (!res.data.ok) throw new Error(res.data.error || "게임 에셋 템플릿 조회에 실패했습니다.");
  return res.data;
}

export async function seedGameAssetTemplates() {
  const res = await fetchClient.post<GameAssetTemplatesResponse>("/game/assets/templates", {});
  if (!res.data.ok) throw new Error(res.data.error || "게임 에셋 템플릿 등록에 실패했습니다.");
  return res.data;
}

export async function listGameAssets(params?: {
  assetType?: string;
  status?: string;
  universeId?: string;
  stageId?: string;
  sourceImageAssetId?: string;
  templateKey?: string;
  q?: string;
  scope?: "all" | "mine";
  page?: number;
  pageSize?: number;
}) {
  const res = await fetchClient.get<GameAssetListResponse>("/game/assets", { params });
  if (!res.data.ok) throw new Error(res.data.error || "게임 에셋 목록 조회에 실패했습니다.");
  return res.data;
}

export async function createGameAsset(payload: Partial<IGameAssetDoc> & { name: string; assetType: string }) {
  const res = await fetchClient.post<GameAssetMutationResponse>("/game/assets", payload);
  if (!res.data.ok || !res.data.data) throw new Error(res.data.error || "게임 에셋 생성에 실패했습니다.");
  return res.data.data;
}

export async function updateGameAsset(payload: Partial<IGameAssetDoc> & { gameAssetId: string }) {
  const res = await fetchClient.put<GameAssetMutationResponse>("/game/assets", payload);
  if (!res.data.ok || !res.data.data) throw new Error(res.data.error || "게임 에셋 수정에 실패했습니다.");
  return res.data.data;
}

export async function publishGameAsset(payload: {
  gameAssetId: string;
  targetType: "persona" | "stage";
  universeId?: string;
  personaPid?: string;
  spriteActionKey?: string;
  stageDocumentId?: string;
  stageId?: string;
  stageName?: string;
  assetName?: string;
  roles?: string[];
  size?: { width?: number; height?: number };
}) {
  const res = await fetchClient.post<{
    ok: boolean;
    data?: { asset?: IGameAssetDoc; publishedTarget?: unknown };
    error?: string;
  }>("/game/assets/publish", payload);
  if (!res.data.ok || !res.data.data) throw new Error(res.data.error || "게임 에셋 발행에 실패했습니다.");
  return res.data.data;
}
