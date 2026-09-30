import "server-only";

import {
  getGameAssetById,
  listUserGameCharacters,
} from "libs/database/game";
import { getImageAssetByAssetId } from "libs/database/lab";
import { resolveImageAssetDisplayUrl } from "libs/server-utils/lab/imageAssetDisplay";
import type {
  IExtendedNpcData,
  IGameAssetDoc,
  IUserGameCharacterDoc,
  IUserGameCharacterSelectableDoc,
} from "types/game";
import type { IPersonaSprite, PersonaSpriteDirection } from "types/ai";
import { toUnknownRecord } from "utils/common/typeUtils";

const DIRECTIONS: PersonaSpriteDirection[] = [
  "left",
  "right",
  "up",
  "down",
  "down-left",
  "up-left",
  "up-right",
  "down-right",
];

function toPositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function toSprite(asset: IGameAssetDoc): IPersonaSprite | null {
  const sheet = asset.spriteSheet;
  const frameWidth = toPositiveInteger(sheet?.frameWidth);
  const frameHeight = toPositiveInteger(sheet?.frameHeight);
  const columns = toPositiveInteger(sheet?.columns);
  const rows = toPositiveInteger(sheet?.rows);
  const url = String(asset.storage?.url || "").trim();
  if (!url || !frameWidth || !frameHeight || !columns || rows < DIRECTIONS.length) return null;

  const sourceAnimations = toUnknownRecord(sheet?.animations);
  const animations = Object.fromEntries(
    DIRECTIONS.map((direction) => {
      const source = toUnknownRecord(sourceAnimations[direction]);
      const row = Number(source.row);
      const frames = Array.isArray(source.frames)
        ? source.frames
            .map(Number)
            .filter((frame) => Number.isInteger(frame) && frame >= 0 && frame < columns)
        : [];
      if (!Number.isInteger(row) || row < 0 || row >= rows || frames.length === 0) {
        return [direction, null] as const;
      }
      return [direction, { row, frames }] as const;
    }),
  );
  if (DIRECTIONS.some((direction) => !animations[direction])) return null;

  return {
    url,
    frameWidth,
    frameHeight,
    columns,
    rows,
    directionCount: 8,
    fps: Math.max(1, Number(sheet?.fps || 8)),
    idleFps: 0,
    idleDirection: "down",
    animations: animations as IPersonaSprite["animations"],
  };
}

async function toSelectable(
  uid: string,
  character: IUserGameCharacterDoc,
): Promise<IUserGameCharacterSelectableDoc | null> {
  if (character.moderationStatus !== "approved") return null;
  const spriteAssetId = String(character.spriteAssetId || "").trim();
  if (!spriteAssetId) return null;

  const asset = await getGameAssetById(spriteAssetId);
  if (
    !asset ||
    String(asset.createdBy || "") !== uid ||
    asset.assetType !== "character-sprite" ||
    !["review", "approved", "published"].includes(String(asset.status || ""))
  ) {
    return null;
  }
  const sprite = toSprite(asset as IGameAssetDoc);
  if (!sprite) return null;

  const sourceAsset = await getImageAssetByAssetId(character.sourceImageAssetId).catch(() => null);
  const portraitDisplay = sourceAsset
    ? await resolveImageAssetDisplayUrl(sourceAsset, { delivery: "signed" }).catch(() => null)
    : null;
  const portraitUrl =
    String(portraitDisplay?.url || "").trim() ||
    "/assets/commerce/placeholder_thumb.jpg";
  const pid = String(character.personaId || character.characterId).trim();
  if (!pid) return null;

  const persona: IExtendedNpcData = {
    pid,
    personaType: character.speciesId === "monster" ? "monster" : "human",
    name: character.name,
    summary: "내가 만든 8방향 AMU Play 캐릭터",
    profiles: { default: [portraitUrl] },
    sprite,
    universeId: character.universeId,
    ownerId: uid,
    instanceOwnerId: uid,
    visibility: "private",
    editPolicy: "owner-only",
    forkPolicy: "fork-on-use",
    status: "active",
    version: character.templateVersion,
    isTemplate: false,
    extra: {
      userGenerated: true,
      userGameCharacterId: character.characterId,
      spriteAssetId,
      speciesId: character.speciesId || "human",
      primaryAttributeId: character.primaryAttributeId || "",
      genesisStatus: character.genesisStatus || "pending",
      referenceKitId: character.sourceReferenceKitId || "",
    },
  };

  return { character, persona };
}

/**
 * @docHint
 * @purpose active 사용자 캐릭터 원장을 기존 8방향 게임 런타임 persona 계약으로 변환
 * @process owner 캐릭터 조회  owner GameAsset/8방향 메타 검증  signed portrait 결합  유효 항목만 반환
 * @domain game.user-character
 * @scope server
 */
export async function listSelectableUserGameCharacters(args: {
  uid: string;
  universeId: string;
  limit?: number;
}) {
  const uid = String(args.uid || "").trim();
  const universeId = String(args.universeId || "").trim();
  if (!uid || !universeId) return [];

  const characters = await listUserGameCharacters({
    uid,
    universeId,
    status: "active",
    limit: args.limit,
  });
  const selectable = await Promise.all(
    characters.map((character) => toSelectable(uid, character)),
  );
  return selectable.filter(
    (item): item is IUserGameCharacterSelectableDoc => Boolean(item),
  );
}
