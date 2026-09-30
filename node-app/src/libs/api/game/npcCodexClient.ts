"use client";

import fetchClient from "libs/api/fetchClient";
import type { INpcCodexResponse } from "types/game/npc-codex";

export async function getNpcCodex(universeId: string) {
  const response = await fetchClient.get<{ ok: boolean; data: INpcCodexResponse }>(
    "/game/npc/codex",
    {
      params: { universeId },
      responseType: "auto",
    },
  );
  return response.data.data;
}
