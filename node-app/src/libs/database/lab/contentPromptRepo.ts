import { getModel } from "libs/database/modelCache";
import { ContentPromptSchema, type IContentPromptDocument } from "models/lab";
import { redisCache } from "libs/cache/redisCacheService";
import { MONGODB_AI_URL } from "consts/env/server";
import type { PromptAccessLevelType } from "types/app";
import { INTERNAL_PROMPT_ACCESS_LEVELS, normalizePromptAccessLevel } from "utils/app/promptAccess";
import { toErrorLike, type UnknownRecord } from "utils/common";

// Mongoose duplicate-key 보호를 위해 errorCode를 부착한 Error
type DuplicateKeyError = Error & { errorCode: "DUPLICATE_KEY" };

function createDuplicateKeyError(): DuplicateKeyError {
  const err = new Error("duplicate_key") as DuplicateKeyError;
  err.errorCode = "DUPLICATE_KEY";
  return err;
}

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process create, exists, get, list, remove, upsert 작업  Redis 캐시 동기화 포함
 * @domain lab
 * @scope server
 */

const COLLECTION = "content_prompts";
const CACHE_TTL = 60 * 60 * 12; // 12시간
const cacheKey = (k: string) => `content:prompt:${k}`;

function normalizeAccessLevels(values?: PromptAccessLevelType[]) {
  return Array.from(new Set((values || []).map((value) => normalizePromptAccessLevel(value))));
}

function buildAccessLevelCondition(values?: PromptAccessLevelType[]) {
  const accessLevels = normalizeAccessLevels(values);
  if (!accessLevels.length) return undefined;
  return { $in: accessLevels.includes("public") ? [...accessLevels, null] : accessLevels };
}

async function getContentModel() {
  return await getModel<IContentPromptDocument>(MONGODB_AI_URL, "ContentPrompt", ContentPromptSchema, COLLECTION);
}

export async function existsContentPromptKey(key: string) {
  const model = await getContentModel();
  const c = await model.countDocuments({ key }).exec();
  return c > 0;
}

export async function createContentPrompt(input: {
  key: string;
  title: string;
  categories?: string[];
  templateText: string;
  accessLevel?: PromptAccessLevelType;
  defaultParams?: UnknownRecord;
  tags?: string[];
  enabled?: boolean;
  updatedBy?: string;
  version?: number;
}) {
  const model = await getContentModel();
  try {
    const doc = await model.create({
      ...input,
      accessLevel: normalizePromptAccessLevel(input.accessLevel),
      categories: input.categories && input.categories.length ? input.categories : ["general"],
    });
    await redisCache.del(cacheKey(input.key));
    return (doc.toObject?.() ?? doc) as IContentPromptDocument;
  } catch (e: unknown) {
    const err = toErrorLike(e);
    if (err.code === 11000 || err.errorCode === 11000) {
      throw createDuplicateKeyError();
    }
    throw e;
  }
}

export async function getContentPromptByKey(key: string) {
  const K = cacheKey(key);
  const cached = await redisCache.get<IContentPromptDocument>(K);
  if (cached) return cached;
  const model = await getContentModel();
  const doc = await model
    .findOne({ key, enabled: true, accessLevel: buildAccessLevelCondition(["public"]) })
    .lean();
  if (doc) await redisCache.set(K, doc, CACHE_TTL);
  return doc;
}

export async function getContentPromptByKeyInternal(key: string) {
  const model = await getContentModel();
  return await model
    .findOne({ key, enabled: true, accessLevel: buildAccessLevelCondition(INTERNAL_PROMPT_ACCESS_LEVELS) })
    .lean();
}

// Admin 용: enabled 여부와 무관하게 단건 조회
export async function getContentPromptByKeyRaw(
  key: string,
  params?: { enabled?: boolean; accessLevels?: PromptAccessLevelType[] },
) {
  const model = await getContentModel();
  const cond: UnknownRecord = { key };
  if (typeof params?.enabled === "boolean") cond.enabled = params.enabled;
  const accessLevelCondition = buildAccessLevelCondition(params?.accessLevels);
  if (accessLevelCondition) cond.accessLevel = accessLevelCondition;
  return await model.findOne(cond).lean();
}

export async function listContentPrompts(params?: {
  q?: string;
  category?: string;
  keys?: string[];
  enabled?: boolean;
  accessLevels?: PromptAccessLevelType[];
  limit?: number;
  skip?: number;
}) {
  const model = await getContentModel();
  const cond = buildContentPromptListCondition(params);
  let query = model.find(cond).sort({ updatedAt: -1 });
  if (typeof params?.skip === "number" && params.skip > 0) query = query.skip(params.skip);
  if (typeof params?.limit === "number" && params.limit > 0) query = query.limit(params.limit);
  return await query.lean();
}

function buildContentPromptListCondition(params?: {
  q?: string;
  category?: string;
  keys?: string[];
  enabled?: boolean;
  accessLevels?: PromptAccessLevelType[];
}) {
  const cond: UnknownRecord = {};
  if (params?.enabled !== undefined) cond.enabled = params.enabled;
  if (params?.category) cond.categories = params.category;
  if (params?.keys?.length) cond.key = { $in: params.keys };
  const accessLevelCondition = buildAccessLevelCondition(params?.accessLevels);
  if (accessLevelCondition) cond.accessLevel = accessLevelCondition;
  if (params?.q) {
    cond.$or = [
      { key: new RegExp(params.q, "i") },
      { title: new RegExp(params.q, "i") },
      { tags: { $elemMatch: { $regex: new RegExp(params.q, "i") } } },
    ];
  }
  return cond;
}

export async function countContentPrompts(params?: {
  q?: string;
  category?: string;
  enabled?: boolean;
  accessLevels?: PromptAccessLevelType[];
}) {
  const model = await getContentModel();
  return await model.countDocuments(buildContentPromptListCondition(params));
}

// input에 없는(undefined) 필드는 $setOnInsert로 보내 "신규 생성 시에만" 기본값을 적용한다.
// 기존 문서를 갱신할 때는 호출자가 명시적으로 보낸 필드만 $set에 실려 나가므로,
// 부분 패치(가산 병합) 호출이 categories/tags/defaultParams 같은 미전달 필드를
// 기본값으로 되돌려 기존 값을 지우는 사고를 막는다.
export async function upsertContentPrompt(input: {
  key: string;
  title: string;
  categories?: string[];
  templateText: string;
  accessLevel?: PromptAccessLevelType;
  defaultParams?: UnknownRecord;
  tags?: string[];
  enabled?: boolean;
  updatedBy?: string;
  version?: number;
}) {
  const model = await getContentModel();
  const now = new Date();

  const setFields: UnknownRecord = {
    title: input.title,
    templateText: input.templateText,
    updatedAt: now,
  };
  if (input.updatedBy !== undefined) setFields.updatedBy = input.updatedBy;

  const setOnInsertFields: UnknownRecord = { createdAt: now };

  const assign = (field: string, value: unknown, fallback: unknown) => {
    if (value !== undefined) setFields[field] = value;
    else setOnInsertFields[field] = fallback;
  };

  assign("categories", input.categories, ["general"]);
  assign("tags", input.tags, []);
  assign("defaultParams", input.defaultParams, {});
  assign("enabled", input.enabled, true);
  assign("version", input.version, 1);
  if (input.accessLevel !== undefined) {
    setFields.accessLevel = normalizePromptAccessLevel(input.accessLevel);
  } else {
    setOnInsertFields.accessLevel = normalizePromptAccessLevel(undefined);
  }

  const doc = await model
    .findOneAndUpdate(
      { key: input.key },
      { $set: setFields, $setOnInsert: setOnInsertFields },
      { upsert: true, new: true },
    )
    .lean();
  await redisCache.del(cacheKey(input.key));
  return doc;
}

export async function removeContentPrompt(key: string) {
  const model = await getContentModel();
  await model.deleteOne({ key });
  await redisCache.del(cacheKey(key));
  return true;
}
