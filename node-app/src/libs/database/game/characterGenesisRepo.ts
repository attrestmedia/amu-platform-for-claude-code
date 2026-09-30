import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  CharacterGenerationRollSchema,
  CharacterProgressSchema,
  CharacterGenesisProfileSchema,
  type ICharacterGenerationRollDocument,
  type ICharacterProgressDocument,
  type ICharacterGenesisProfileDocument,
} from "models/game";
import type {
  ICharacterGenerationRollDoc,
  ICharacterProgressDoc,
  ICharacterGenesisProfileDoc,
} from "types/game/character-genesis";

const isDuplicateKeyError = (error: unknown) =>
  Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);

export async function getCharacterGenesisProfileModel(): Promise<Model<ICharacterGenesisProfileDocument>> {
  return getModel<ICharacterGenesisProfileDocument>(MONGODB_GAME_URL, "CharacterGenesisProfile", CharacterGenesisProfileSchema, "character_genesis_profiles");
}

export async function getCharacterProgressModel(): Promise<Model<ICharacterProgressDocument>> {
  return getModel<ICharacterProgressDocument>(MONGODB_GAME_URL, "CharacterProgress", CharacterProgressSchema, "character_progress");
}

export async function getCharacterGenerationRollModel(): Promise<Model<ICharacterGenerationRollDocument>> {
  return getModel<ICharacterGenerationRollDocument>(MONGODB_GAME_URL, "CharacterGenerationRoll", CharacterGenerationRollSchema, "character_generation_rolls");
}

export async function getCharacterGenesisProfile(args: { uid: string; characterId: string }) {
  return (await getCharacterGenesisProfileModel())
    .findOne({ uid: String(args.uid || "").trim(), characterId: String(args.characterId || "").trim() })
    .lean<ICharacterGenesisProfileDoc | null>();
}

export async function createGenesisProfileIfAbsent(input: ICharacterGenesisProfileDoc) {
  const model = await getCharacterGenesisProfileModel();
  return model
    .findOneAndUpdate(
      { characterId: input.characterId },
      { $setOnInsert: input },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    .lean<ICharacterGenesisProfileDoc>();
}

export async function createCharacterProgressIfAbsent(input: ICharacterProgressDoc) {
  const model = await getCharacterProgressModel();
  return model
    .findOneAndUpdate(
      { characterId: input.characterId },
      { $setOnInsert: input },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    .lean<ICharacterProgressDoc>();
}

export async function createGenerationRollIfAbsent(input: Omit<ICharacterGenerationRollDoc, "rollId"> & { rollId?: string }) {
  const model = await getCharacterGenerationRollModel();
  const prepared = { ...input, rollId: input.rollId || `roll_${randomUUID().replace(/-/g, "")}` };
  try {
    return {
      doc: await model.create(prepared),
      created: true,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await model.findOne({ idempotencyKey: input.idempotencyKey }).lean<ICharacterGenerationRollDoc | null>();
    if (!existing) throw error;
    return { doc: existing, created: false };
  }
}

export async function markGenerationRollApplied(args: { uid: string; rollId: string }) {
  const model = await getCharacterGenerationRollModel();
  return model
    .findOneAndUpdate(
      { uid: String(args.uid || "").trim(), rollId: String(args.rollId || "").trim(), status: { $in: ["prepared", "applying"] } },
      { $set: { status: "applied", appliedAt: new Date() } },
      { new: true },
    )
    .lean<ICharacterGenerationRollDoc | null>();
}

export async function markGenerationRollApplying(args: { uid: string; rollId: string }) {
  const model = await getCharacterGenerationRollModel();
  return model
    .findOneAndUpdate(
      { uid: String(args.uid || "").trim(), rollId: String(args.rollId || "").trim(), status: "prepared" },
      { $set: { status: "applying" } },
      { new: true },
    )
    .lean<ICharacterGenerationRollDoc | null>();
}

export async function getGenerationRollByIdempotencyKey(args: { uid: string; idempotencyKey: string }) {
  return (await getCharacterGenerationRollModel())
    .findOne({ uid: String(args.uid || "").trim(), idempotencyKey: String(args.idempotencyKey || "").trim() })
    .lean<ICharacterGenerationRollDoc | null>();
}

export async function getGenesisBundle(args: { uid: string; characterId: string }) {
  const uid = String(args.uid || "").trim();
  const characterId = String(args.characterId || "").trim();
  const [profile, progress, roll] = await Promise.all([
    (await getCharacterGenesisProfileModel()).findOne({ uid, characterId }).lean<ICharacterGenesisProfileDoc | null>(),
    (await getCharacterProgressModel()).findOne({ uid, characterId }).lean<ICharacterProgressDoc | null>(),
    (await getCharacterGenerationRollModel()).findOne({ uid, characterId }).sort({ createdAt: -1 }).lean<ICharacterGenerationRollDoc | null>(),
  ]);
  return { profile, progress, roll };
}
