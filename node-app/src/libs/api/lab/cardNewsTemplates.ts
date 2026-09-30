import fetchClient from "libs/api/fetchClient";
import type {
  CardNewsTemplatePreset,
  CardNewsTemplateRegistryEntry,
} from "types/card-news";

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

export type CardNewsTemplateAdminMutation =
  | { action: "register" | "publish_version"; preset: CardNewsTemplatePreset }
  | { action: "activate" | "deactivate"; id: string; version: number };

function requireData<T>(response: ApiEnvelope<T>, fallback: string) {
  if (!response?.ok || response.data === undefined) throw new Error(response?.error || fallback);
  return response.data;
}

export async function listCardNewsTemplates() {
  const response = await fetchClient.get<ApiEnvelope<CardNewsTemplatePreset[]>>(
    "/lab/card-news/templates",
    { responseType: "auto", cache: "no-store" },
  );
  return requireData(response.data, "카드뉴스 템플릿을 불러오지 못했습니다.");
}

export async function listAdminCardNewsTemplates() {
  const response = await fetchClient.get<ApiEnvelope<CardNewsTemplateRegistryEntry[]>>(
    "/lab/card-news/templates/admin",
    { responseType: "auto", cache: "no-store" },
  );
  return requireData(response.data, "카드뉴스 템플릿 관리 목록을 불러오지 못했습니다.");
}

export async function mutateAdminCardNewsTemplate(payload: CardNewsTemplateAdminMutation) {
  const response = await fetchClient.post<ApiEnvelope<CardNewsTemplateRegistryEntry>>(
    "/lab/card-news/templates/admin",
    payload,
    { responseType: "auto" },
  );
  return requireData(response.data, "카드뉴스 템플릿을 저장하지 못했습니다.");
}
