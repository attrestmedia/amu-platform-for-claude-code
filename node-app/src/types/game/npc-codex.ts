import type { IntimacyLevelType } from "consts/game/gameEntities";

export type INpcCodexHiddenItem = {
  codexId: string;
  discovered: false;
  name: "???";
};

export type INpcCodexDiscoveredItem = {
  codexId: string;
  discovered: true;
  npcId: string;
  name: string;
  personaType: "human" | "monster";
  subtitle: string;
  summary: string;
  portraitUrl: string;
  intimacy: number;
  intimacyLevel: IntimacyLevelType;
};

export type NpcCodexItemType = INpcCodexHiddenItem | INpcCodexDiscoveredItem;

export interface INpcCodexResponse {
  universeId: string;
  summary: {
    total: number;
    discovered: number;
  };
  items: NpcCodexItemType[];
}
