import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType, RequestValidator } from "libs/server-utils/api/_helpers";
import { getModel } from "libs/database/modelCache";
import { PersonasSchema, type IPersonasDocument } from "models/user";
import { MONGODB_PERSONAS_MODEL_PREFIX, MONGODB_USER_PERSONAS_MODEL_PREFIX } from "consts/db";
import { MONGODB_USERS_URL } from "consts/env/server";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

const PERSONA_TYPES = new Set(["personas", "userPersonas"]);
const SERVER_MUTABLE_SET_FIELDS = new Set(["mood", "lastInteraction"]);
const SERVER_MUTABLE_INC_FIELDS = new Set(["totalInteractions", "intimacy"]);
const CLIENT_FORBIDDEN_FIELDS = new Set(["level", "xp", "hp", "mp", "iq", "eq", "luck"]);
const MOODS = new Set([
  "neutral",
  "confident",
  "calm",
  "passionate",
  "mysterious",
  "optimistic",
  "intellectual",
  "charismatic",
  "cheerful",
  "anxious",
  "sensitive",
  "aloof",
  "distracted",
  "lethargic",
  "cynical",
  "irritable",
]);

const validatePersonaPatch: RequestValidator<UnknownRecord> = (data) => {
  if (typeof data?.universe !== "string" || !data.universe.trim() || data.universe.length > 80) {
    return { valid: false, error: "PERSONA_UNIVERSE_INVALID" };
  }
  if (typeof data?.personaId !== "string" || !data.personaId.trim() || data.personaId.length > 160) {
    return { valid: false, error: "PERSONA_ID_INVALID" };
  }
  if (!PERSONA_TYPES.has(String(data?.type || ""))) return { valid: false, error: "PERSONA_TYPE_INVALID" };
  const patch = data?.patch;
  if (!patch || typeof patch !== "object") return { valid: false, error: "PERSONA_PATCH_INVALID" };
  const patchRecord = patch as UnknownRecord;
  const setRecord = patchRecord.set && typeof patchRecord.set === "object" ? (patchRecord.set as UnknownRecord) : {};
  const incRecord = patchRecord.inc && typeof patchRecord.inc === "object" ? (patchRecord.inc as UnknownRecord) : {};
  for (const key of Object.keys(setRecord)) {
    if (CLIENT_FORBIDDEN_FIELDS.has(key)) return { valid: false, error: "PERSONA_STAT_WRITE_FORBIDDEN" };
    if (!SERVER_MUTABLE_SET_FIELDS.has(key)) return { valid: false, error: "PERSONA_FIELD_NOT_MUTABLE" };
  }
  for (const key of Object.keys(incRecord)) {
    if (CLIENT_FORBIDDEN_FIELDS.has(key)) return { valid: false, error: "PERSONA_STAT_WRITE_FORBIDDEN" };
    if (!SERVER_MUTABLE_INC_FIELDS.has(key)) return { valid: false, error: "PERSONA_FIELD_NOT_MUTABLE" };
    if (typeof incRecord[key] !== "number" || !Number.isInteger(incRecord[key])) {
      return { valid: false, error: "PERSONA_INCREMENT_INVALID" };
    }
  }
  if (!Object.keys(setRecord).length && !Object.keys(incRecord).length) {
    return { valid: false, error: "PERSONA_PATCH_EMPTY" };
  }
  if (setRecord.mood !== undefined && (typeof setRecord.mood !== "string" || !MOODS.has(setRecord.mood))) {
    return { valid: false, error: "PERSONA_MOOD_INVALID" };
  }
  if (incRecord.totalInteractions !== undefined && incRecord.totalInteractions !== 1) {
    return { valid: false, error: "PERSONA_INTERACTION_INCREMENT_INVALID" };
  }
  const intimacyDelta = incRecord.intimacy;
  if (typeof intimacyDelta === "number" && (intimacyDelta < -100 || intimacyDelta > 100)) {
    return { valid: false, error: "PERSONA_INTIMACY_INCREMENT_INVALID" };
  }
  return { valid: true };
};

const validatePersonaRegistration: RequestValidator<UnknownRecord> = (data) => {
  if (data.command !== "ensure" && data.command !== "register-npc") {
    return { valid: false, error: "PERSONA_COMMAND_INVALID" };
  }
  if (typeof data.universe !== "string" || !data.universe.trim() || data.universe.length > 80) {
    return { valid: false, error: "PERSONA_UNIVERSE_INVALID" };
  }
  if (data.command === "ensure") {
    if (data.type !== "userPersonas" || !Array.isArray(data.personaIds) || data.personaIds.length > 50) {
      return { valid: false, error: "PERSONA_REGISTRATION_INVALID" };
    }
    if (data.personaIds.some((value) => typeof value !== "string" || !value.trim() || value.length > 160)) {
      return { valid: false, error: "PERSONA_ID_INVALID" };
    }
  } else if (data.type !== "personas" || typeof data.personaId !== "string" || !data.personaId.trim()) {
    return { valid: false, error: "PERSONA_REGISTRATION_INVALID" };
  }
  return { valid: true };
};

export const POST = withAuth<UnknownRecord>(
  async (body, user) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    const universe = String(body.universe).trim();
    const type = String(body.type);
    const modelName = `${type === "personas" ? MONGODB_PERSONAS_MODEL_PREFIX : MONGODB_USER_PERSONAS_MODEL_PREFIX}${uid}_${universe}`;
    const model = await getModel<IPersonasDocument>(MONGODB_USERS_URL, modelName, PersonasSchema, modelName);
    const personaIds = body.command === "ensure" ? body.personaIds : [body.personaId];
    const added: UnknownRecord[] = [];

    await model.findOneAndUpdate(
      { uid, universe },
      { $setOnInsert: { uid, universe, personas: [] } },
      { upsert: true, new: true },
    );
    for (const rawId of personaIds as string[]) {
      const pid = rawId.trim();
      const item = {
        pid,
        level: 1,
        xp: 0,
        hp: 100,
        mp: 100,
        iq: 100,
        eq: 100,
        luck: 0,
        mood: "neutral",
        intimacy: 0,
        ownership: false,
        isUnlocked: body.command === "ensure",
        firstInteraction: body.command === "register-npc" ? new Date().toISOString() : undefined,
        lastInteraction: new Date().toISOString(),
        totalInteractions: 0,
        hasArtifact: body.command === "ensure",
      };
      await model.updateOne(
        { uid, universe, personas: { $not: { $elemMatch: { pid } } } },
        { $push: { personas: item } },
      );
      added.push(item);
    }
    const doc = await model.findOne({ uid, universe }).lean();
    const rows = Array.isArray(doc?.personas)
      ? doc.personas.filter((entry) => (personaIds as string[]).includes(String(toUnknownRecord(entry).pid)))
      : [];
    return NextResponse.json({ ok: true, data: { personas: rows.length ? rows : added } });
  },
  validatePersonaRegistration,
  "user/persona:register",
);

export const PATCH = withAuth<UnknownRecord>(
  async (body, user) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    const universe = String(body.universe).trim();
    const personaId = String(body.personaId).trim();
    const type = String(body.type);
    const patch = body.patch as UnknownRecord;
    const setRecord = (patch.set && typeof patch.set === "object" ? patch.set : {}) as UnknownRecord;
    const incRecord = (patch.inc && typeof patch.inc === "object" ? patch.inc : {}) as UnknownRecord;
    const modelName = `${type === "personas" ? MONGODB_PERSONAS_MODEL_PREFIX : MONGODB_USER_PERSONAS_MODEL_PREFIX}${uid}_${universe}`;
    const model = await getModel<IPersonasDocument>(MONGODB_USERS_URL, modelName, PersonasSchema, modelName);

    const update: Record<string, Record<string, unknown>> = { $set: { "personas.$.lastInteraction": new Date() } };
    if (typeof setRecord.mood === "string") update.$set["personas.$.mood"] = setRecord.mood;
    if (incRecord.totalInteractions === 1) {
      update.$inc = { "personas.$.totalInteractions": 1 };
    }
    const intimacyDelta = typeof incRecord.intimacy === "number" ? incRecord.intimacy : 0;
    if (intimacyDelta) {
      update.$inc = { ...(update.$inc || {}), "personas.$.intimacy": intimacyDelta };
    }

    const currentQuery: Record<string, unknown> = { uid, universe, "personas.pid": personaId };
    if (intimacyDelta > 0) {
      currentQuery.personas = {
        $elemMatch: { pid: personaId, $or: [{ intimacy: { $lte: 999 - intimacyDelta } }, { intimacy: { $exists: false } }] },
      };
    } else if (intimacyDelta < 0) {
      currentQuery.personas = {
        $elemMatch: { pid: personaId, intimacy: { $gte: -intimacyDelta } },
      };
    }
    const updated = await model.findOneAndUpdate(currentQuery, update, { new: true }).lean();
    if (!updated) return NextResponse.json({ ok: false, error: "PERSONA_NOT_FOUND_OR_BOUND_EXCEEDED" }, { status: 404 });
    const persona = toUnknownRecord(updated).personas;
    const item = Array.isArray(persona)
      ? persona.find((entry) => toUnknownRecord(entry).pid === personaId)
      : null;
    return NextResponse.json({ ok: true, data: { persona: item || null } });
  },
  validatePersonaPatch,
  "user/persona:patch",
);
