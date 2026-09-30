import type { Model } from "mongoose";
import { MONGODB_GAME_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  NpcIntimacySchema,
  NpcIntimacySettlementSchema,
  type INpcIntimacyDocument,
  type INpcIntimacySettlementDocument,
} from "models/game";
import type {
  INpcIntimacyDoc,
  INpcIntimacySettlementDoc,
  INpcIntimacySettlementResult,
  INpcIntimacyView,
} from "types/game/npc-intimacy";

/**
 * @docHint
 * @purpose NPC 친밀도 집계·세션 멱등 원장 모델과 owner 범위 조회 제공
 * @process game DB 모델 획득  uid/npcId 정규화  현재 상태 조회  미생성 기본 DTO 반환
 * @domain game.npc-intimacy
 * @scope server
 */

function normalizeRequiredKey(value: unknown, errorCode: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(errorCode);
  return normalized;
}

export async function getNpcIntimacyModel(): Promise<Model<INpcIntimacyDocument>> {
  return getModel<INpcIntimacyDocument>(
    MONGODB_GAME_URL,
    "NpcIntimacy",
    NpcIntimacySchema,
    "npc_intimacies",
  );
}

export async function getNpcIntimacySettlementModel(): Promise<Model<INpcIntimacySettlementDocument>> {
  return getModel<INpcIntimacySettlementDocument>(
    MONGODB_GAME_URL,
    "NpcIntimacySettlement",
    NpcIntimacySettlementSchema,
    "npc_intimacy_settlements",
  );
}

export async function getNpcIntimacyForUser(args: {
  uid: string;
  npcId: string;
}): Promise<INpcIntimacyView> {
  const uid = normalizeRequiredKey(args.uid, "npc_intimacy_uid_required");
  const npcId = normalizeRequiredKey(args.npcId, "npc_intimacy_npc_id_required");
  const model = await getNpcIntimacyModel();
  const item = await model.findOne({ uid, npcId }).lean<INpcIntimacyDoc | null>();

  return {
    npcId,
    intimacy: Math.max(0, Math.min(999, Number(item?.intimacy || 0))),
    discovered: item?.discovered === true,
    dayKey: String(item?.dayKey || ""),
    dayGainCount: Math.max(0, Number(item?.dayGainCount || 0)),
  };
}

export async function listNpcIntimaciesForUser(args: {
  uid: string;
  npcIds: string[];
}): Promise<INpcIntimacyDoc[]> {
  const uid = normalizeRequiredKey(args.uid, "npc_intimacy_uid_required");
  const npcIds = Array.from(
    new Set(args.npcIds.map((item) => String(item || "").trim()).filter(Boolean)),
  ).slice(0, 200);
  if (npcIds.length === 0) return [];
  const model = await getNpcIntimacyModel();
  return model.find({ uid, npcId: { $in: npcIds } }).lean<INpcIntimacyDoc[]>();
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

function settlementKey(args: { uid: string; npcId: string; conversationSessionId: string }) {
  return {
    uid: normalizeRequiredKey(args.uid, "npc_intimacy_uid_required"),
    npcId: normalizeRequiredKey(args.npcId, "npc_intimacy_npc_id_required"),
    conversationSessionId: normalizeRequiredKey(
      args.conversationSessionId,
      "npc_intimacy_conversation_session_id_required",
    ),
  };
}

export async function getNpcIntimacySettlementByKey(args: {
  uid: string;
  npcId: string;
  conversationSessionId: string;
}) {
  const model = await getNpcIntimacySettlementModel();
  return model
    .findOne(settlementKey(args))
    .lean<INpcIntimacySettlementDoc | null>();
}

export async function rejectNpcIntimacySettlementIfAbsent(args: {
  uid: string;
  npcId: string;
  conversationSessionId: string;
  dayKey: string;
  reason: string;
}): Promise<INpcIntimacySettlementDoc> {
  const model = await getNpcIntimacySettlementModel();
  const key = settlementKey(args);
  const existing = await model.findOne(key).lean<INpcIntimacySettlementDoc | null>();
  if (existing) return existing;

  try {
    const created = await model.create({
      ...key,
      status: "rejected",
      serverComputedGain: 0,
      appliedGain: 0,
      dayKey: String(args.dayKey || "").trim(),
      rejectionReason: String(args.reason || "quality_rejected").trim().slice(0, 120),
    });
    return (created.toObject?.() ?? created) as INpcIntimacySettlementDoc;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await model.findOne(key).lean<INpcIntimacySettlementDoc | null>();
      if (raced) return raced;
    }
    throw error;
  }
}

export async function settleNpcIntimacyGainAtomic(args: {
  uid: string;
  npcId: string;
  conversationSessionId: string;
  dayKey: string;
  serverComputedGain: number;
  dailyGainLimit: number;
  applyingStaleMs: number;
}): Promise<INpcIntimacySettlementResult> {
  const stateModel = await getNpcIntimacyModel();
  const settlementModel = await getNpcIntimacySettlementModel();
  const key = settlementKey(args);
  const dayKey = normalizeRequiredKey(args.dayKey, "npc_intimacy_day_key_required");
  const serverComputedGain = Math.max(0, Math.min(999, Math.floor(Number(args.serverComputedGain || 0))));
  const dailyGainLimit = Math.max(0, Math.min(999, Math.floor(Number(args.dailyGainLimit || 0))));
  const now = new Date();
  const staleBefore = new Date(now.getTime() - Math.max(1, Number(args.applyingStaleMs || 0)));

  let existing = await settlementModel.findOne(key).lean<INpcIntimacySettlementDoc | null>();
  if (!existing) {
    try {
      const prepared = await settlementModel.create({
        ...key,
        status: "prepared",
        serverComputedGain,
        appliedGain: 0,
        dayKey,
      });
      existing = (prepared.toObject?.() ?? prepared) as INpcIntimacySettlementDoc;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      existing = await settlementModel.findOne(key).lean<INpcIntimacySettlementDoc | null>();
    }
  }

  if (existing?.status === "applied" || existing?.status === "rejected") {
    return {
      settlement: existing,
      intimacy: await getNpcIntimacyForUser({ uid: key.uid, npcId: key.npcId }),
      duplicate: true,
      inProgress: false,
    };
  }

  const claimed = await settlementModel
    .findOneAndUpdate(
      {
        ...key,
        $or: [
          { status: { $in: ["prepared", "failed"] } },
          { status: "applying", applyingAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: {
          status: "applying",
          applyingAt: now,
          serverComputedGain,
          dayKey,
          rejectionReason: "",
        },
      },
      { new: true },
    )
    .lean<INpcIntimacySettlementDoc | null>();

  if (!claimed) {
    const current = await settlementModel.findOne(key).lean<INpcIntimacySettlementDoc | null>();
    if (!current) throw new Error("npc_intimacy_settlement_claim_missing");
    return {
      settlement: current,
      intimacy: await getNpcIntimacyForUser({ uid: key.uid, npcId: key.npcId }),
      duplicate: true,
      inProgress: current.status === "applying",
    };
  }

  const session = await stateModel.db.startSession();
  let result: INpcIntimacySettlementResult | null = null;
  try {
    await session.withTransaction(async () => {
      const currentState = await stateModel
        .findOne({ uid: key.uid, npcId: key.npcId })
        .session(session)
        .lean<INpcIntimacyDoc | null>();
      const currentIntimacy = Math.max(0, Math.min(999, Number(currentState?.intimacy || 0)));
      const currentDayGain = currentState?.dayKey === dayKey
        ? Math.max(0, Number(currentState.dayGainCount || 0))
        : 0;
      const appliedGain = Math.max(
        0,
        Math.min(serverComputedGain, dailyGainLimit - currentDayGain, 999 - currentIntimacy),
      );

      const state = await stateModel
        .findOneAndUpdate(
          { uid: key.uid, npcId: key.npcId },
          {
            $set: {
              intimacy: currentIntimacy + appliedGain,
              discovered: true,
              dayKey,
              dayGainCount: currentDayGain + appliedGain,
            },
            $setOnInsert: { uid: key.uid, npcId: key.npcId },
          },
          { new: true, upsert: true, runValidators: true, session },
        )
        .lean<INpcIntimacyDoc | null>();
      if (!state) throw new Error("npc_intimacy_state_apply_failed");

      const appliedAt = new Date();
      const settlement = await settlementModel
        .findOneAndUpdate(
          { ...key, status: "applying" },
          {
            $set: {
              status: "applied",
              appliedGain,
              appliedAt,
              dayKey,
              rejectionReason: "",
            },
          },
          { new: true, session },
        )
        .lean<INpcIntimacySettlementDoc | null>();
      if (!settlement) throw new Error("npc_intimacy_settlement_apply_failed");

      result = {
        settlement,
        intimacy: {
          npcId: key.npcId,
          intimacy: Number(state.intimacy || 0),
          discovered: state.discovered === true,
          dayKey: String(state.dayKey || ""),
          dayGainCount: Number(state.dayGainCount || 0),
        },
        duplicate: false,
        inProgress: false,
      };
    });
  } catch (error) {
    await settlementModel.updateOne(
      { ...key, status: "applying" },
      {
        $set: { status: "failed", rejectionReason: "settlement_retryable_error" },
        $unset: { applyingAt: "" },
      },
    );
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) throw new Error("npc_intimacy_settlement_result_missing");
  return result;
}
