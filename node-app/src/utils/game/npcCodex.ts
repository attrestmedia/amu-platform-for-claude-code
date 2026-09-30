import crypto from "crypto";
import { intimacyLevelHelper } from "consts/game/gameEntities";
import type { INpcIntimacyDoc } from "types/game/npc-intimacy";
import type { INpcCodexResponse, NpcCodexItemType } from "types/game/npc-codex";
import { toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 공개 NPC catalog와 owner 친밀도를 그림자/발견 도감 DTO로 안전 변환
 * @process public persona 최소 필드 정규화  미발견 identity redaction  발견 친밀도 단계 계산
 * @domain game.npc-codex
 * @scope server
 */

type PublicNpcPersona = {
  pid?: string;
  personaType?: string;
  name?: string;
  job?: string;
  species?: string;
  summary?: string;
  profiles?: unknown;
};

function makeCodexId(universeId: string, npcId: string) {
  return `codex_${crypto.createHash("sha256").update(`${universeId}|${npcId}`).digest("hex").slice(0, 20)}`;
}

function getPortraitUrl(profilesRaw: unknown) {
  const profiles = toUnknownRecord(profilesRaw);
  const defaults = Array.isArray(profiles.default) ? profiles.default : [];
  const fallback = Object.values(profiles).find((value) => Array.isArray(value) && value.length > 0);
  const first = defaults[0] ?? (Array.isArray(fallback) ? fallback[0] : "");
  return typeof first === "string" ? first.trim() : "";
}

export function buildNpcCodexResponse(args: {
  universeId: string;
  personas: PublicNpcPersona[];
  intimacies: INpcIntimacyDoc[];
}): INpcCodexResponse {
  const universeId = String(args.universeId || "").trim();
  const intimacyMap = new Map(
    args.intimacies.map((item) => [String(item.npcId || "").trim(), item]),
  );
  const items: NpcCodexItemType[] = [];

  for (const persona of args.personas) {
    const npcId = String(persona.pid || "").trim();
    if (!npcId) continue;
    const codexId = makeCodexId(universeId, npcId);
    const progress = intimacyMap.get(npcId);
    if (progress?.discovered !== true) {
      items.push({ codexId, discovered: false, name: "???" });
      continue;
    }

    const personaType = persona.personaType === "monster" ? "monster" : "human";
    const intimacy = Math.max(0, Math.min(999, Number(progress.intimacy || 0)));
    items.push({
      codexId,
      discovered: true,
      npcId,
      name: String(persona.name || "Unknown").trim().slice(0, 80) || "Unknown",
      personaType,
      subtitle: String(personaType === "monster" ? persona.species || "" : persona.job || "")
        .trim()
        .slice(0, 100),
      summary: String(persona.summary || "").trim().slice(0, 240),
      portraitUrl: getPortraitUrl(persona.profiles),
      intimacy,
      intimacyLevel: intimacyLevelHelper(intimacy),
    });
  }

  items.sort((a, b) => {
    if (a.discovered !== b.discovered) return a.discovered ? -1 : 1;
    return a.discovered && b.discovered
      ? a.name.localeCompare(b.name)
      : a.codexId.localeCompare(b.codexId);
  });

  return {
    universeId,
    summary: {
      total: items.length,
      discovered: items.filter((item) => item.discovered).length,
    },
    items,
  };
}
