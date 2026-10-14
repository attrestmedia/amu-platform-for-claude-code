import "server-only";
import { MONGODB_AMU_URL } from "consts/env/server";
import { assertWritableSystemSettingKey } from "consts/system/systemSettingKeys";
import { getModel } from "libs/database/modelCache";
import { SystemSettingSchema, type ISystemSettingDocument } from "models/system";
import { classifySystemSettingDocument, type SystemSettingRead } from "./systemSettingValue";
import { logger } from "utils/log";

const SYSTEM_SETTINGS_COLLECTION = "system_settings";

async function getSystemSettingModel() {
  return await getModel<ISystemSettingDocument>(
    MONGODB_AMU_URL,
    "SystemSetting",
    SystemSettingSchema,
    SYSTEM_SETTINGS_COLLECTION,
  );
}

export async function readSystemSetting(key: string): Promise<SystemSettingRead> {
  const Model = await getSystemSettingModel();
  const doc = await Model.findOne({ key, scope: "global" }).lean<ISystemSettingDocument | null>();
  return classifySystemSettingDocument(doc);
}

export async function getSystemSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const read = await readSystemSetting(key);
  if (read.status === "ok") return read.value as T;
  if (read.status === "invalid") {
    logger.error("[system-setting] 저장값 형식이 올바르지 않아 무시합니다.", {
      key,
      valueType: read.valueType,
    });
  }
  return null;
}

export async function setSystemSetting(args: {
  key: string;
  value: Record<string, unknown>;
  description?: string;
  updatedBy?: string;
}) {
  // key는 운영 문서의 식별자다. 규칙에 어긋난 key로 새 문서가 생기면 나중에 개명할 수 없다.
  assertWritableSystemSettingKey(args.key);
  const Model = await getSystemSettingModel();
  return await Model.findOneAndUpdate(
    { key: args.key, scope: "global" },
    {
      $set: {
        value: args.value,
        description: args.description || "",
        updatedBy: args.updatedBy || "",
      },
      $setOnInsert: { key: args.key, scope: "global" },
    },
    { upsert: true, new: true },
  ).lean<ISystemSettingDocument>();
}

export async function insertSystemSettingIfAbsent(args: {
  key: string;
  value: Record<string, unknown>;
  description?: string;
  updatedBy?: string;
}): Promise<{ inserted: boolean }> {
  assertWritableSystemSettingKey(args.key);
  const Model = await getSystemSettingModel();
  const result = await Model.updateOne(
    { key: args.key, scope: "global" },
    {
      $setOnInsert: {
        key: args.key,
        scope: "global",
        value: args.value,
        description: args.description || "",
        updatedBy: args.updatedBy || "",
      },
    },
    { upsert: true },
  );
  return { inserted: Number(result.upsertedCount || 0) === 1 };
}

export async function replaceSystemSettingValueIfUnchanged(args: {
  key: string;
  expectedUpdatedAt: Date;
  value: Record<string, unknown>;
  updatedBy?: string;
}): Promise<{ applied: boolean }> {
  assertWritableSystemSettingKey(args.key);
  const Model = await getSystemSettingModel();
  const result = await Model.updateOne(
    { key: args.key, scope: "global", updatedAt: args.expectedUpdatedAt },
    {
      $set: {
        value: args.value,
        updatedBy: args.updatedBy || "",
      },
    },
  );
  return { applied: Number(result.matchedCount || 0) === 1 };
}

export async function deleteSystemSettingIfUnchanged(args: {
  key: string;
  expectedUpdatedAt: Date;
}): Promise<{ deleted: boolean }> {
  assertWritableSystemSettingKey(args.key);
  const Model = await getSystemSettingModel();
  const result = await Model.deleteOne({
    key: args.key,
    scope: "global",
    updatedAt: args.expectedUpdatedAt,
  });
  return { deleted: Number(result.deletedCount || 0) === 1 };
}

export async function readSystemSettingDocument(key: string): Promise<{
  read: SystemSettingRead;
  updatedAt: Date | null;
}> {
  const Model = await getSystemSettingModel();
  const doc = await Model.findOne({ key, scope: "global" }).lean<ISystemSettingDocument | null>();
  const updatedAt = doc?.updatedAt instanceof Date && Number.isFinite(doc.updatedAt.getTime())
    ? doc.updatedAt
    : null;
  return { read: classifySystemSettingDocument(doc), updatedAt };
}

export async function listSystemSettingsByKeyPrefix(prefix: string): Promise<Array<{
  key: string;
  read: SystemSettingRead;
  updatedAt: Date | null;
}>> {
  const Model = await getSystemSettingModel();
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docs = await Model.find({ key: { $regex: `^${escapedPrefix}` }, scope: "global" })
    .lean<ISystemSettingDocument[]>();
  return docs.map((doc) => ({
    key: doc.key,
    read: classifySystemSettingDocument(doc),
    updatedAt: doc.updatedAt instanceof Date && Number.isFinite(doc.updatedAt.getTime())
      ? doc.updatedAt
      : null,
  }));
}
