import "server-only";

import { createHash } from "node:crypto";
import {
  createUserGameCharacterIfAbsent,
  getUserGameCharacterById,
  getGenesisBundle,
  updateUserGameCharacterGenesisState,
} from "libs/database/game";
import { createUserCharacterGenesis } from "libs/server-utils/game/characterGenesisService";
import type { IUserGameCharacterDoc, UserGameCharacterSourceType } from "types/game";

export type CharacterCreationSagaInput = {
  uid: string;
  universeId: string;
  name: string;
  sourceType: UserGameCharacterSourceType;
  sourceImageRef: string;
  sourceImageAssetId: string;
  sourcePersonaId?: string;
  sourceReferenceKitId?: string;
  speciesId: "human" | "monster";
  primaryAttributeId?: string;
  archetypeId?: string;
  templateVersion: number;
  idempotencyKey: string;
  characterId?: string;
};

function stableGenesisIdempotencyKey(characterId: string) {
  return createHash("sha256")
    .update(`character-genesis|${characterId}|v1`, "utf8")
    .digest("hex");
}

function toErrorCode(error: unknown) {
  return String((error as { code?: unknown })?.code || (error as { message?: unknown })?.message || "GENESIS_SAGA_FAILED")
    .trim()
    .slice(0, 96);
}

/**
 * CharacterDefinition(이미지 원장) → Genesis(1회 roll) → Asset pipeline 순서를 고정하는 saga.
 * Asset 생성은 호출자가 뒤이어 시작하며, 이 saga는 유료 이미지 생성과 rarity roll을 결합하지 않는다.
 */
export async function createUserCharacterWithGenesis(args: CharacterCreationSagaInput) {
  const created = await createUserGameCharacterIfAbsent({
    uid: args.uid,
    universeId: args.universeId,
    name: args.name,
    status: "draft",
    sourceType: args.sourceType,
    sourceImageRef: args.sourceImageRef,
    sourceImageAssetId: args.sourceImageAssetId,
    sourcePersonaId: args.sourcePersonaId || "",
    sourceReferenceKitId: args.sourceReferenceKitId || "",
    speciesId: args.speciesId,
    primaryAttributeId: args.primaryAttributeId || "",
    genesisStatus: "pending",
    genesisErrorCode: "",
    templateVersion: args.templateVersion,
    idempotencyKey: args.idempotencyKey,
    pipelineId: "",
    spriteAssetId: "",
    personaId: "",
    moderationStatus: "pending",
    disabledReason: "",
    ...(args.characterId ? { characterId: args.characterId } : {}),
  });
  const character = created.character;

  const existingGenesis = await getGenesisBundle({ uid: args.uid, characterId: character.characterId });
  const stableSpecies = existingGenesis.profile?.speciesId === "monster"
    ? "monster"
    : existingGenesis.profile?.speciesId === "human"
      ? "human"
      : character.speciesId === "monster"
        ? "monster"
        : character.speciesId === "human"
          ? "human"
          : args.speciesId;
  const stableAttribute = existingGenesis.profile?.primaryAttributeId || character.primaryAttributeId || args.primaryAttributeId;

  await updateUserGameCharacterGenesisState({
    uid: args.uid,
    characterId: character.characterId,
    status: "pending",
    speciesId: stableSpecies,
    primaryAttributeId: stableAttribute,
  });

  try {
    const genesis = await createUserCharacterGenesis({
      uid: args.uid,
      universeId: character.universeId,
      speciesId: stableSpecies,
      primaryAttributeId: stableAttribute,
      archetypeId: args.archetypeId,
      characterId: character.characterId,
      idempotencyKey: stableGenesisIdempotencyKey(character.characterId),
    });
    if (!genesis.profile || !genesis.roll) throw new Error("GENESIS_BUNDLE_INCOMPLETE");
    const updated = await updateUserGameCharacterGenesisState({
      uid: args.uid,
      characterId: character.characterId,
      status: "applied",
      speciesId: genesis.profile.speciesId === "monster" ? "monster" : "human",
      primaryAttributeId: genesis.profile.primaryAttributeId,
    });
    return {
      character: (updated || character) as IUserGameCharacterDoc,
      created: created.created,
      genesis,
      genesisIdempotencyKey: stableGenesisIdempotencyKey(character.characterId),
    };
  } catch (error) {
    await updateUserGameCharacterGenesisState({
      uid: args.uid,
      characterId: character.characterId,
      status: "failed",
      speciesId: stableSpecies,
      primaryAttributeId: stableAttribute,
      errorCode: toErrorCode(error),
    }).catch(() => null);
    throw error;
  }
}

export async function reconcileUserCharacterGenesis(args: { uid: string; characterId: string }) {
  const character = await getUserGameCharacterById(args);
  if (!character) return null;
  const bundle = await getGenesisBundle(args);
  return { character, genesis: bundle };
}

export { stableGenesisIdempotencyKey };
