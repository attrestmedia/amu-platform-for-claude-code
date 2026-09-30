import fetchClient from "libs/api/fetchClient";
import type { ChatModelServiceType, IChatModelPolicyResult, TextProviderType } from "types/ai";
import { ensureGuestId } from "utils/normalize";

type ChatModelEnvelope = {
  ok?: boolean;
  data?: IChatModelPolicyResult;
};

export type ChatModelContext = {
  service: ChatModelServiceType;
  universeId?: string;
  personaId?: string;
};

function requestConfig(service: ChatModelServiceType) {
  if (service !== "amu") return { responseType: "json" as const };
  const guestId = ensureGuestId();
  return {
    responseType: "json" as const,
    ...(guestId ? { headers: { "x-guest-id": guestId } } : {}),
  };
}

export async function getChatModelPolicy(context: ChatModelContext) {
  const response = await fetchClient.get<ChatModelEnvelope>("/ai/chat-models", {
    params: context,
    ...requestConfig(context.service),
  });
  return response.data?.data || null;
}

export async function setChatModelPreference(
  context: ChatModelContext & { provider: TextProviderType; modelName: string },
) {
  const response = await fetchClient.post<ChatModelEnvelope>("/ai/chat-models", context, {
    responseType: "json",
  });
  return response.data?.data || null;
}

export async function setAmuChatModelPreference(args:
  | { mode: "recommended" }
  | { mode: "preference"; provider: TextProviderType; modelName: string }) {
  const response = await fetchClient.post<ChatModelEnvelope>(
    "/ai/chat-models",
    { service: "amu", ...args },
    { responseType: "json" },
  );
  return response.data?.data || null;
}
