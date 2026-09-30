import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { SpriteActionSchema, type ISpriteActionDocument } from "models/game";
import type { ISpriteActionDoc, SpriteActionScopeType } from "types/game/sprite-action";

function makeActionId() {
  return `gsa_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function getSpriteActionModel(): Promise<Model<ISpriteActionDocument>> {
  return getModel<ISpriteActionDocument>(
    MONGODB_GAME_URL,
    "SpriteAction",
    SpriteActionSchema,
    "game_sprite_actions",
  );
}

export async function listSpriteActions(args: { ownerId: string; universeId?: string }) {
  const model = await getSpriteActionModel();
  const ownerId = String(args.ownerId || "").trim();
  const universeId = String(args.universeId || "").trim();
  const access: Record<string, unknown>[] = [
    { scope: "system" },
    { scope: "user", ownerId },
  ];
  if (universeId) access.push({ scope: "universe", universeId });
  return model
    .find({ $or: access })
    .sort({ scope: 1, actionKey: 1 })
    .lean<ISpriteActionDoc[]>();
}

export async function upsertSpriteAction(input: Omit<ISpriteActionDoc, "actionId" | "createdAt" | "updatedAt">) {
  const model = await getSpriteActionModel();
  const scope = input.scope as SpriteActionScopeType;
  const ownerId = String(input.ownerId || "").trim();
  const actionKey = String(input.actionKey || "").trim();
  return model
    .findOneAndUpdate(
      { scope, ownerId, actionKey },
      {
        $set: { ...input, scope, ownerId, actionKey },
        $setOnInsert: { actionId: makeActionId() },
      },
      { new: true, upsert: true, runValidators: true },
    )
    .lean<ISpriteActionDoc>();
}
