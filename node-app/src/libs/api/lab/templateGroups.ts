import fetchClient from "libs/api/fetchClient";
import type { GenStudioTemplateGroupType } from "types/app";

type ApiEnvelopeType<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

export type TemplateGroupWritePayload =
  | {
      action: "create";
      key: string;
      promptType?: "image" | "content";
      title: string;
      description: string;
      visibility: "public" | "private";
      serviceKeys: string[];
      templateKeys: string[];
    }
  | {
      action: "update";
      key: string;
      title: string;
      description: string;
      visibility: "public" | "private";
      serviceKeys: string[];
    }
  | {
      action: "add_templates" | "remove_templates";
      key: string;
      templateKeys: string[];
    }
  | {
      action: "set_recommended";
      key: string;
      recommendedTemplateKeys: string[];
      recommendedDescription: { ko: string; en: string };
    };

export async function listPublicGenStudioTemplateGroups() {
  const response = await fetchClient.get<ApiEnvelopeType<GenStudioTemplateGroupType[]>>("/lab/template-groups", {
    responseType: "auto",
    cache: "no-store",
  });
  return response.data?.data || [];
}

export async function getGenStudioTemplateGroup(key: string) {
  const response = await fetchClient.get<ApiEnvelopeType<GenStudioTemplateGroupType>>(
    `/lab/template-groups/${encodeURIComponent(key)}`,
    { responseType: "auto", cache: "no-store" },
  );
  return response.data?.data || null;
}

export async function listAdminGenStudioTemplateGroups() {
  const response = await fetchClient.get<ApiEnvelopeType<GenStudioTemplateGroupType[]>>(
    "/lab/template-groups/admin",
    { responseType: "auto", cache: "no-store" },
  );
  return response.data?.data || [];
}

export async function writeAdminGenStudioTemplateGroup(payload: TemplateGroupWritePayload) {
  const response = await fetchClient.post<ApiEnvelopeType<GenStudioTemplateGroupType>>(
    "/lab/template-groups/admin",
    payload,
    { responseType: "auto" },
  );
  if (!response.data?.ok) throw new Error(response.data?.error || "template_group_save_failed");
  return response.data.data || null;
}

export async function deleteAdminGenStudioTemplateGroup(key: string, confirmKey: string) {
  const response = await fetchClient.deleteWithBody<ApiEnvelopeType>(
    "/lab/template-groups/admin",
    { key, confirmKey },
    { responseType: "auto" },
  );
  if (!response.data?.ok) throw new Error(response.data?.error || "template_group_delete_failed");
  return true;
}
