"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SpriteStudioView } from "./SpriteStudioView";
import type { AnimationPresetKey } from "./AnimationPresetGrid";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";

const ROUTE_ACTIONS = new Set<AnimationPresetKey>(["walk", "run", "attack"]);

export function SpriteStudioRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get("characterId")?.trim() || undefined;
  const requestedAction = searchParams.get("action") as AnimationPresetKey | null;
  const initialAction = requestedAction && ROUTE_ACTIONS.has(requestedAction) ? requestedAction : "walk";

  const setRoute = (nextCharacterId?: string, action = initialAction) => {
    const params = new URLSearchParams();
    if (nextCharacterId) params.set("characterId", nextCharacterId);
    if (action !== "walk") params.set("action", action);
    const query = params.toString();
    router.push(`/assets-studio/sprite${query ? `?${query}` : ""}`);
  };

  return (
    <SpriteStudioView
      key={`${characterId || "none"}:${initialAction}`}
      universeId={DEFAULT_PLAY_UNIVERSE}
      characterId={characterId}
      initialAction={initialAction}
      onChooseCharacter={(nextCharacterId) => setRoute(nextCharacterId)}
      onActionChange={(action) => {
        if (ROUTE_ACTIONS.has(action)) setRoute(characterId, action);
      }}
    />
  );
}
