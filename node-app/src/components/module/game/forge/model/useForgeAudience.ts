"use client";

import { useMemo } from "react";
import { useUserData } from "hooks/auth";
import { PLAY_USER_AUDIENCE, resolveForgeAudience, type ForgeAudienceContext } from "./forgeAudienceModel";

export function useForgeAudience(): ForgeAudienceContext & { isReady: boolean } {
  const { isAdministrator, isLoading, isReady: isUserDataReady } = useUserData();
  const isReady = isUserDataReady && !isLoading;

  const audienceContext = useMemo(
    () => (isReady ? resolveForgeAudience({ isAdministrator: Boolean(isAdministrator) }) : PLAY_USER_AUDIENCE),
    [isAdministrator, isReady],
  );

  return { ...audienceContext, isReady };
}
