import fetchClient from "libs/api/fetchClient";
import type { PersonaFormValuesType, PublicTutorGalleryItemType } from "types/ai";
import type { BaseImageType } from "types/app";
import type { TutorConversationLevel } from "consts/tutors";
import { isDev, type UnknownRecord } from "utils/common";
import { v4 as uuidv4 } from "uuid";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/tutors/personas) 호출 구성  응답/에러 정리 반환
 * @domain tutors
 * @scope client_lib
 */

const BASE = "/tutors/personas";
const createRequestId = () => (isDev ? uuidv4() : crypto.randomUUID());

type TutorsApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  billing?: { coins?: number };
};

// fetchClient 래핑 변화 방어: data가 한 번 더 감싸진 경우 unwrap
const unwrap = <T>(res: { data?: TutorsApiEnvelope<T> | unknown } | unknown): TutorsApiEnvelope<T> => {
  const candidate = (res as { data?: unknown })?.data ?? res;
  return (candidate || {}) as TutorsApiEnvelope<T>;
};

export async function listTutorsPersonas(): Promise<PersonaFormValuesType[]> {
  const res = await fetchClient.get<TutorsApiEnvelope<PersonaFormValuesType[]>>(BASE, { responseType: "auto" });
  const body = unwrap<PersonaFormValuesType[]>(res);
  return (body?.data || []) as PersonaFormValuesType[];
}

export async function saveTutorsPersona(data: PersonaFormValuesType): Promise<PersonaFormValuesType> {
  const res = await fetchClient.post<TutorsApiEnvelope<PersonaFormValuesType>>(
    BASE,
    { data, ...(!data.pid ? { requestId: createRequestId() } : {}) },
    { responseType: "auto" },
  );
  const body = unwrap<PersonaFormValuesType>(res);
  if (!body?.success) throw new Error(body?.error || "save_failed");
  return body.data as PersonaFormValuesType;
}

export async function getTutorsPersona(pid: string): Promise<PersonaFormValuesType | null> {
  try {
    const res = await fetchClient.get<TutorsApiEnvelope<PersonaFormValuesType>>(
      `${BASE}/${encodeURIComponent(pid)}`,
      { responseType: "auto" },
    );
    const body = unwrap<PersonaFormValuesType>(res);
    return (body?.data as PersonaFormValuesType) || null;
  } catch {
    return null;
  }
}

export async function updateTutorsPersonaConversationLevel(
  pid: string,
  conversationLevel: TutorConversationLevel,
): Promise<PersonaFormValuesType> {
  const res = await fetchClient.patch<TutorsApiEnvelope<PersonaFormValuesType>>(
    `${BASE}/${encodeURIComponent(pid)}`,
    { conversationLevel },
    { responseType: "auto" },
  );
  const body = unwrap<PersonaFormValuesType>(res);
  if (!body?.success) throw new Error(body?.error || "update_conversation_level_failed");
  return body.data as PersonaFormValuesType;
}

export async function deleteTutorsPersona(pid: string): Promise<boolean> {
  const res = await fetchClient.delete<TutorsApiEnvelope<UnknownRecord>>(
    `${BASE}/${encodeURIComponent(pid)}`,
    { responseType: "auto" },
  );
  const body = unwrap<UnknownRecord>(res);
  return !!body?.success;
}

export async function listSharedTutorsPersonaTemplates(params?: { q?: string; mine?: boolean; limit?: number }) {
  const res = await fetchClient.get<TutorsApiEnvelope<PersonaFormValuesType[]>>(BASE, {
    params: {
      scope: "templates",
      ...(params?.q ? { q: params.q } : {}),
      ...(typeof params?.mine === "boolean" ? { mine: params.mine } : {}),
      ...(typeof params?.limit === "number" ? { limit: params.limit } : {}),
    },
    responseType: "auto",
  });
  const body = unwrap<PersonaFormValuesType[]>(res);
  return (body?.data || []) as PersonaFormValuesType[];
}

export async function listPublicTutorGallery(limit = 8, options?: { includeNoImage?: boolean }): Promise<PublicTutorGalleryItemType[]> {
  const res = await fetchClient.get<TutorsApiEnvelope<PublicTutorGalleryItemType[]>>("/tutors/public-gallery", {
    params: { limit, ...(options?.includeNoImage ? { includeNoImage: true } : {}) },
    responseType: "auto",
  });
  const body = unwrap<PublicTutorGalleryItemType[]>(res);
  return (body?.data || []) as PublicTutorGalleryItemType[];
}

export async function publishTutorsPersonaTemplate(pid: string, visibility: "private" | "unlisted" | "public" = "public") {
  const res = await fetchClient.post<TutorsApiEnvelope<PersonaFormValuesType>>(
    BASE,
    {
      action: "publish_template",
      pid,
      visibility,
    },
    { responseType: "auto" },
  );
  const body = unwrap<PersonaFormValuesType>(res);
  if (!body?.success) throw new Error(body?.error || "publish_template_failed");
  return body.data as PersonaFormValuesType;
}

export async function updateTutorsPersonaTemplate(
  pid: string,
  data: PersonaFormValuesType,
  visibility: "private" | "unlisted" | "public" = "public",
) {
  const res = await fetchClient.post<TutorsApiEnvelope<PersonaFormValuesType>>(
    BASE,
    {
      action: "update_template",
      pid,
      data,
      visibility,
    },
    { responseType: "auto" },
  );
  const body = unwrap<PersonaFormValuesType>(res);
  if (!body?.success) throw new Error(body?.error || "update_template_failed");
  return body.data as PersonaFormValuesType;
}

export async function forkTutorsPersonaTemplate(pid: string) {
  const res = await fetchClient.post<TutorsApiEnvelope<PersonaFormValuesType>>(
    BASE,
    {
      action: "fork_template",
      pid,
      requestId: createRequestId(),
    },
    { responseType: "auto" },
  );
  const body = unwrap<PersonaFormValuesType>(res);
  if (!body?.success) throw new Error(body?.error || "fork_template_failed");
  return body.data as PersonaFormValuesType;
}

export async function generateTutorsPersonaDraft(params: {
  modelName?: string;
  systemPersonaKey?: string;
  brief?: string;
  outputLanguage?: "ko" | "en";
  seed?: Partial<PersonaFormValuesType>;
  baseImages?: BaseImageType[];
}) {
  const res = await fetchClient.post<TutorsApiEnvelope<Partial<PersonaFormValuesType>>>(
    BASE,
    {
      action: "generate_ai_draft",
      modelName: params.modelName,
      systemPersonaKey: params.systemPersonaKey,
      brief: params.brief,
      outputLanguage: params.outputLanguage,
      seed: params.seed,
      baseImages: params.baseImages,
    },
    { responseType: "auto" },
  );
  const body = unwrap<Partial<PersonaFormValuesType>>(res);
  if (!body?.success) throw new Error(body?.error || "generate_ai_draft_failed");
  return {
    data: (body?.data || {}) as Partial<PersonaFormValuesType>,
    billing: {
      coins: Number(body?.billing?.coins || 0),
    },
  };
}

export async function giftTutorsPersona(params: { pid: string; recipientActorId: string; message?: string }) {
  const res = await fetchClient.post<TutorsApiEnvelope<UnknownRecord>>(
    BASE,
    {
      action: "gift_tutor",
      pid: params.pid,
      recipientActorId: params.recipientActorId,
      message: params.message || "",
    },
    { responseType: "auto" },
  );
  const body = unwrap<UnknownRecord>(res);
  if (!body?.success) throw new Error(body?.error || "gift_tutor_failed");
  return body.data as UnknownRecord;
}

export async function acceptTutorsPersonaGift(grantId: string) {
  const res = await fetchClient.post<TutorsApiEnvelope<UnknownRecord>>(
    BASE,
    { action: "accept_gift", grantId },
    { responseType: "auto" },
  );
  const body = unwrap<UnknownRecord>(res);
  if (!body?.success) throw new Error(body?.error || "accept_gift_failed");
  return body.data as UnknownRecord;
}

export async function rejectTutorsPersonaGift(grantId: string) {
  const res = await fetchClient.post<TutorsApiEnvelope<UnknownRecord>>(
    BASE,
    { action: "reject_gift", grantId },
    { responseType: "auto" },
  );
  const body = unwrap<UnknownRecord>(res);
  if (!body?.success) throw new Error(body?.error || "reject_gift_failed");
  return body.data as UnknownRecord;
}

export async function getTutorsPersonaTemplate(pid: string) {
  const res = await fetchClient.get<TutorsApiEnvelope<PersonaFormValuesType>>(
    `${BASE}/${encodeURIComponent(pid)}`,
    {
      params: { scope: "template" },
      responseType: "auto",
    },
  );
  const body = unwrap<PersonaFormValuesType>(res);
  return (body?.data as PersonaFormValuesType) || null;
}

export async function deleteTutorsPersonaTemplate(pid: string): Promise<boolean> {
  const res = await fetchClient.delete<TutorsApiEnvelope<UnknownRecord>>(
    `${BASE}/${encodeURIComponent(pid)}`,
    {
      params: { scope: "template" },
      responseType: "auto",
    },
  );
  const body = unwrap<UnknownRecord>(res);
  return !!body?.success;
}
