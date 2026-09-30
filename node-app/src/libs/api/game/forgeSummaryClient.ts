import fetchClient from "libs/api/fetchClient";

export type ForgeStepStatusValue = "locked" | "todo" | "in_progress" | "done";

export type ForgeSummaryCharacter = {
  characterId: string;
  name: string;
  status: string;
  imageUrl: string;
  updatedAt?: string;
};

export type ForgeSummaryMap = {
  stageId: string;
  stageName: string;
  updatedAt?: string;
};

export type ForgeRecentWorkItem = {
  kind: "character" | "asset" | "map";
  id: string;
  name: string;
  imageUrl?: string;
  updatedAt?: string;
};

export type ForgeSummary = {
  characters: {
    total: number;
    active: number;
    latest: ForgeSummaryCharacter | null;
  };
  assets: {
    total: number;
    byCategory: Record<string, number>;
  };
  maps: {
    total: number;
    latest: ForgeSummaryMap | null;
  };
  recentWork: ForgeRecentWorkItem[];
  stepStatus: Record<string, ForgeStepStatusValue>;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
};

export async function getForgeSummary(): Promise<ForgeSummary> {
  const response = await fetchClient.get<ApiEnvelope<ForgeSummary>>("/game/forge/summary", {
    responseType: "auto",
    cache: "no-store",
  });
  const data = response.data?.data;
  if (!data) throw new Error(response.data?.error || "forge_summary_failed");
  return data;
}
