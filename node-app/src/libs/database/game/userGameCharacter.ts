import { randomUUID } from "node:crypto";
import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { UserGameCharacterSchema, type IUserGameCharacterDocument } from "models/game";
import type {
  IUserGameCharacterDoc,
  IUserGameCharacterReportResult,
  UserGameCharacterReportReasonType,
  UserGameCharacterStatusType,
} from "types/game/user-game-character";

function makeCharacterId() {
  return `ugc_${randomUUID().replace(/-/g, "")}`;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

export async function getUserGameCharacterModel(): Promise<Model<IUserGameCharacterDocument>> {
  return getModel<IUserGameCharacterDocument>(
    MONGODB_GAME_URL,
    "UserGameCharacter",
    UserGameCharacterSchema,
    "user_game_characters",
  );
}

export async function createUserGameCharacterIfAbsent(
  input: Omit<IUserGameCharacterDoc, "characterId" | "createdAt" | "updatedAt"> & { characterId?: string },
): Promise<{ character: IUserGameCharacterDoc; created: boolean }> {
  const model = await getUserGameCharacterModel();
  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (!idempotencyKey) throw new Error("character_idempotency_key_required");

  const existing = await model.findOne({ idempotencyKey }).lean<IUserGameCharacterDoc | null>();
  if (existing) {
    if (existing.status === "disabled" && existing.disabledReason === "anchor_reselected") {
      const reactivated = await model
        .findOneAndUpdate(
          { idempotencyKey, status: "disabled", disabledReason: "anchor_reselected" },
          {
            $set: {
              status: existing.pipelineId ? "generating" : "draft",
              disabledReason: "",
            },
          },
          { new: true },
        )
        .lean<IUserGameCharacterDoc | null>();
      if (reactivated) return { character: reactivated, created: false };
    }
    return { character: existing, created: false };
  }

  try {
    const doc = await model.create({
      ...input,
      characterId: input.characterId || makeCharacterId(),
      idempotencyKey,
    });
    return { character: (doc.toObject?.() ?? doc) as IUserGameCharacterDoc, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await model.findOne({ idempotencyKey }).lean<IUserGameCharacterDoc | null>();
      if (raced) return { character: raced, created: false };
    }
    throw error;
  }
}

export async function listUserGameCharacters(args: {
  uid: string;
  universeId?: string;
  status?: UserGameCharacterStatusType;
  limit?: number;
}) {
  const model = await getUserGameCharacterModel();
  const query: Record<string, unknown> = { uid: String(args.uid || "").trim() };
  if (String(args.universeId || "").trim()) query.universeId = String(args.universeId).trim();
  if (String(args.status || "").trim()) query.status = String(args.status).trim();
  const limit = Math.max(1, Math.min(50, Number(args.limit || 20)));
  return model.find(query).sort({ updatedAt: -1 }).limit(limit).lean<IUserGameCharacterDoc[]>();
}

export async function listUserGameCharacterFailedAnchorIds(args: {
  uid: string;
  universeId?: string;
}) {
  const model = await getUserGameCharacterModel();
  const query: Record<string, unknown> = { uid: String(args.uid || "").trim() };
  const universeId = String(args.universeId || "").trim();
  if (universeId) query.universeId = universeId;
  const rows = await model.distinct("failedAnchorIds", query);
  return rows.map((value) => String(value || "").trim()).filter(Boolean);
}

export async function getUserGameCharacterById(args: { uid: string; characterId: string }) {
  const model = await getUserGameCharacterModel();
  return model
    .findOne({
      uid: String(args.uid || "").trim(),
      characterId: String(args.characterId || "").trim(),
    })
    .lean<IUserGameCharacterDoc | null>();
}

export async function getUserGameCharacterByIdempotencyKey(args: { uid: string; idempotencyKey: string }) {
  const model = await getUserGameCharacterModel();
  return model
    .findOne({
      uid: String(args.uid || "").trim(),
      idempotencyKey: String(args.idempotencyKey || "").trim(),
    })
    .lean<IUserGameCharacterDoc | null>();
}

/** 캐릭터의 mechanics universe는 유지하고 lore 소속 Personal Universe만 owner 범위로 연결한다. */
export async function attachUserGameCharacterPersonalUniverse(args: {
  uid: string;
  characterId: string;
  personalUniverseId: string;
}) {
  const uid = String(args.uid || "").trim();
  const characterId = String(args.characterId || "").trim();
  const personalUniverseId = String(args.personalUniverseId || "").trim();
  if (!uid || !characterId || !personalUniverseId) throw new Error("personal_universe_assignment_invalid");
  const model = await getUserGameCharacterModel();
  const current = await model.findOne({ uid, characterId }).lean<IUserGameCharacterDoc | null>();
  if (!current) throw new Error("character_not_found_or_forbidden");
  if (current.personalUniverseId && current.personalUniverseId !== personalUniverseId) {
    throw new Error("personal_universe_assignment_conflict");
  }
  return model
    .findOneAndUpdate(
      { uid, characterId, $or: [{ personalUniverseId: "" }, { personalUniverseId: null }, { personalUniverseId: { $exists: false } }] },
      { $set: { personalUniverseId } },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

export async function updateUserGameCharacterGenesisState(args: {
  uid: string;
  characterId: string;
  status: "pending" | "applied" | "failed";
  speciesId?: "human" | "monster";
  primaryAttributeId?: string;
  errorCode?: string;
}) {
  const model = await getUserGameCharacterModel();
  return model
    .findOneAndUpdate(
      { uid: String(args.uid || "").trim(), characterId: String(args.characterId || "").trim() },
      {
        $set: {
          genesisStatus: args.status,
          ...(args.speciesId ? { speciesId: args.speciesId } : {}),
          ...(args.primaryAttributeId ? { primaryAttributeId: args.primaryAttributeId } : {}),
          genesisErrorCode: String(args.errorCode || "").trim(),
        },
      },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

export async function attachUserGameCharacterPipelineAtomic(args: {
  uid: string;
  characterId: string;
  pipelineId: string;
}) {
  const model = await getUserGameCharacterModel();
  return model
    .findOneAndUpdate(
      {
        uid: String(args.uid || "").trim(),
        characterId: String(args.characterId || "").trim(),
        status: { $in: ["draft", "generating", "verify_failed"] },
        $or: [{ pipelineId: "" }, { pipelineId: null }, { pipelineId: { $exists: false } }],
      },
      {
        $set: {
          pipelineId: String(args.pipelineId || "").trim(),
          status: "generating",
        },
      },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

export async function syncUserGameCharacterPipelineStatus(args: {
  uid: string;
  characterId: string;
  pipelineId: string;
  status: Extract<UserGameCharacterStatusType, "generating" | "verify_failed">;
}) {
  const model = await getUserGameCharacterModel();
  return model
    .findOneAndUpdate(
      {
        uid: String(args.uid || "").trim(),
        characterId: String(args.characterId || "").trim(),
        pipelineId: String(args.pipelineId || "").trim(),
        status: { $ne: "disabled" },
      },
      { $set: { status: args.status } },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

// 사용자 재시도 시 실패했던 anchor assetId를 캐릭터 문서에 누적 기록 (선택기 배지용)
export async function recordUserGameCharacterFailedAnchorAtomic(args: {
  uid: string;
  characterId: string;
  assetId: string;
}) {
  const model = await getUserGameCharacterModel();
  const assetId = String(args.assetId || "").trim();
  if (!assetId) return null;
  return model
    .findOneAndUpdate(
      {
        uid: String(args.uid || "").trim(),
        characterId: String(args.characterId || "").trim(),
      },
      { $addToSet: { failedAnchorIds: assetId } },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

export async function clearUserGameCharacterFailedAnchorHistory(args: {
  uid: string;
  universeId: string;
  assetId: string;
}) {
  const model = await getUserGameCharacterModel();
  const assetId = String(args.assetId || "").trim();
  if (!assetId) return null;
  return model.updateMany(
    {
      uid: String(args.uid || "").trim(),
      universeId: String(args.universeId || "").trim(),
      failedAnchorIds: assetId,
    },
    { $pull: { failedAnchorIds: assetId } },
  );
}

export async function confirmUserGameCharacterResultAtomic(args: {
  uid: string;
  characterId: string;
  pipelineId: string;
  spriteAssetId: string;
}) {
  const model = await getUserGameCharacterModel();
  return model
    .findOneAndUpdate(
      {
        uid: String(args.uid || "").trim(),
        characterId: String(args.characterId || "").trim(),
        pipelineId: String(args.pipelineId || "").trim(),
        status: { $in: ["generating", "verify_failed", "active"] },
      },
      {
        $set: {
          spriteAssetId: String(args.spriteAssetId || "").trim(),
          status: "active",
          moderationStatus: "approved",
          disabledReason: "",
        },
      },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

export async function abandonUserGameCharacterAtomic(args: {
  uid: string;
  characterId: string;
  pipelineId: string;
  reason: "anchor_reselected";
}) {
  const model = await getUserGameCharacterModel();
  return model
    .findOneAndUpdate(
      {
        uid: String(args.uid || "").trim(),
        characterId: String(args.characterId || "").trim(),
        pipelineId: String(args.pipelineId || "").trim(),
        status: { $ne: "disabled" },
      },
      {
        $set: {
          status: "disabled",
          disabledReason: args.reason,
        },
      },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
}

export async function reportAndDisableUserGameCharacterAtomic(args: {
  actorUid: string;
  characterId: string;
  reason: UserGameCharacterReportReasonType;
  note?: string;
  canModerateAnyOwner?: boolean;
}): Promise<IUserGameCharacterReportResult | null> {
  const model = await getUserGameCharacterModel();
  const actorUid = String(args.actorUid || "").trim();
  const characterId = String(args.characterId || "").trim();
  const ownerQuery = args.canModerateAnyOwner ? {} : { uid: actorUid };
  const updated = await model
    .findOneAndUpdate(
      {
        ...ownerQuery,
        characterId,
        status: { $ne: "disabled" },
      },
      {
        $set: {
          status: "disabled",
          moderationStatus: "rejected",
          disabledReason: `user_report:${args.reason}`,
          reportedAt: new Date(),
          reportedBy: actorUid,
          reportReason: args.reason,
          reportNote: String(args.note || "").trim().slice(0, 240),
        },
      },
      { new: true },
    )
    .lean<IUserGameCharacterDoc | null>();
  if (updated) return { character: updated, changed: true };

  const existing = await model
    .findOne({ ...ownerQuery, characterId })
    .lean<IUserGameCharacterDoc | null>();
  return existing ? { character: existing, changed: false } : null;
}
