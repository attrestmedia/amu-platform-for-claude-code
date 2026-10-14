import "server-only";
import type { NarrativeStatId } from "types/game";

export const PLAY_DISCOVERY_ACTIVITY_ID = "play.discovery.gate-mystery" as const;

export type PlayActivityCapability = {
  difficulty: number;
  attributeStatMap: Record<string, NarrativeStatId>;
  fallbackStatId: NarrativeStatId;
};

/** Server-owned capability rules for Play activities. */
export const PLAY_ACTIVITY_CAPABILITY: Record<string, PlayActivityCapability> = {
  [PLAY_DISCOVERY_ACTIVITY_ID]: {
    difficulty: 45,
    attributeStatMap: {
      resolve: "focus",
      wonder: "insight",
    },
    fallbackStatId: "adaptability",
  },
};

export function resolvePlayActivityCapability(activityId: string): PlayActivityCapability {
  if (!Object.prototype.hasOwnProperty.call(PLAY_ACTIVITY_CAPABILITY, activityId)) {
    throw new Error("PLAY_ACTIVITY_NOT_DECLARED");
  }

  return PLAY_ACTIVITY_CAPABILITY[activityId];
}
