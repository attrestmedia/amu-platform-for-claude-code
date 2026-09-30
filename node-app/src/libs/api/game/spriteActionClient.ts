import fetchClient from "libs/api/fetchClient";
import type { ISpriteActionDoc, SpriteActionScopeType } from "types/game";

type SpriteActionEnvelope = {
  ok?: boolean;
  data?: ISpriteActionDoc | ISpriteActionDoc[];
  error?: string;
};

export async function listSpriteActions(params?: { universeId?: string }) {
  const response = await fetchClient.get<SpriteActionEnvelope>("/game/sprite-actions", {
    params,
    responseType: "auto",
    cache: "no-store",
  });
  if (!response.data?.ok || !Array.isArray(response.data.data)) {
    throw new Error(response.data?.error || "sprite_actions_list_failed");
  }
  return response.data.data;
}

export async function saveSpriteAction(payload: {
  actionKey: string;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  motionAction: string;
  motionSequence: string;
  fps: number;
  loop: boolean;
  frameCount?: number;
  symmetryEligible?: boolean;
  motionGuideVersion?: number;
  scope?: SpriteActionScopeType;
  universeId?: string;
}) {
  const response = await fetchClient.post<SpriteActionEnvelope>("/game/sprite-actions", payload, {
    responseType: "auto",
  });
  if (!response.data?.ok || !response.data.data || Array.isArray(response.data.data)) {
    throw new Error(response.data?.error || "sprite_action_save_failed");
  }
  return response.data.data;
}
