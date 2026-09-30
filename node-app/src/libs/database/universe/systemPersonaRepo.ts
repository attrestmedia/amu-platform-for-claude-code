import { getModel } from "libs/database/modelCache";
import type { ISystemPersonaDocument } from "models/universe";
import type {
  SystemPersonaServiceType,
  SystemPersonaTutorsPolicyDefaultsType,
  SystemPersonaUsageType,
} from "types/ai";
import {
  normalizeSystemPersonaLifecycleMetadata,
  normalizeSystemPersonaTutorsPolicyDefaults,
  normalizeSystemPersonaUsageType,
} from "types/ai";
import { SystemPersonaSchema } from "models/universe";
import { redisCache } from "libs/cache/redisCacheService";
import { normalizeKey } from "utils/normalize";
import { MONGODB_AI_URL } from "consts/env/server";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get, list, remove, upsert 작업  Redis 캐시 동기화 포함
 * @domain persona
 * @scope server
 */

const COLLECTION = "system_personas";
const CACHE_TTL = 60 * 60 * 12; // 12시간
const cacheKey = (k: string, universeId: string | null, personaPid: string | null) =>
  `system:persona:${k}:${universeId ?? "global"}:${personaPid ?? "global"}`;
const normalizeScopeValue = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

// deprecated preset은 기존 참조에서만 읽을 수 있고, 신규 선택 목록에는 들어가지 않는다.
const runtimePersonaCondition = {
  $or: [
    { runtimeResolvable: { $ne: false }, lifecycle: { $in: ["published", "deprecated"] } },
    { runtimeResolvable: { $exists: false }, lifecycle: { $exists: false } },
  ],
};

async function getSystemPersonaModel() {
  return await getModel<ISystemPersonaDocument>(MONGODB_AI_URL, "SystemPersona", SystemPersonaSchema, COLLECTION);
}

export async function getPersonaByKey(
  key: string,
  opts?: { universeId?: string | null; personaPid?: string | null; revision?: number },
) {
  const k = normalizeKey(key);

  const model = await getSystemPersonaModel();

  const uid = typeof opts?.universeId === "string" ? opts!.universeId!.trim() : "";
  const pid = typeof opts?.personaPid === "string" ? opts!.personaPid!.trim() : "";
  const requestedRevision = Number(opts?.revision);
  const hasRequestedRevision = Number.isInteger(requestedRevision) && requestedRevision > 0;

  const candidates: Array<{ universeId: string | null; personaPid: string | null }> = [];
  if (uid && pid) candidates.push({ universeId: uid, personaPid: pid });
  if (uid) candidates.push({ universeId: uid, personaPid: null });
  candidates.push({ universeId: null, personaPid: null });

  for (const c of candidates) {
    const K = cacheKey(k, c.universeId, c.personaPid);
    if (!hasRequestedRevision) {
      const cached = await redisCache.get<ISystemPersonaDocument>(K);
      if (cached) return cached;
    }

    const query: Record<string, unknown> = {
      key: k,
      enabled: true,
      universeId: c.universeId,
      personaPid: c.personaPid,
      ...runtimePersonaCondition,
    };
    if (hasRequestedRevision) {
      const revisionConditions: Record<string, unknown>[] = [
        { revision: requestedRevision },
        { revision: { $exists: false }, version: requestedRevision },
      ];
      if (requestedRevision === 1) {
        revisionConditions.push({ revision: { $exists: false }, version: { $exists: false } });
      }
      query.$and = [{ $or: revisionConditions }];
    }
    const doc = await model.findOne(query).lean();
    if (doc) {
      if (!hasRequestedRevision) await redisCache.set(K, doc, CACHE_TTL);
      return doc;
    }
  }

  return null;
}

export async function getPromptTextByKey(
  key: string,
  opts?: { universeId?: string | null; personaPid?: string | null },
): Promise<string> {
  try {
    const doc = await getPersonaByKey(key, opts);
    return (doc?.prompt || "").trim();
  } catch (e) {
    logger.warn("[systemPersonaRepo] getPromptTextByKey 실패:", e);
    return "";
  }
}

export async function getSelectablePersonaByKey(
  key: string,
  service: SystemPersonaServiceType,
  opts?: { universeId?: string | null; personaPid?: string | null },
) {
  const doc = await getPersonaByKey(key, opts);
  if (!doc) return null;
  const metadata = normalizeSystemPersonaLifecycleMetadata(doc);
  if (!doc.enabled || metadata.lifecycle !== "published" || !metadata.runtimeResolvable) return null;
  if (!metadata.selectableServices.includes(service)) return null;
  return doc;
}

export async function listPersonas(params?: {
  q?: string;
  category?: string;
  enabled?: boolean;
  universeId?: string;
  personaPid?: string;
  forUniverses?: SystemPersonaUsageType;
}) {
  const model = await getSystemPersonaModel();
  const cond: Record<string, unknown> = {};
  if (params?.enabled !== undefined) cond.enabled = params.enabled;
  if (params?.category) cond.category = params.category;
  if (params?.universeId) cond.universeId = params.universeId;
  if (params?.personaPid) cond.personaPid = params.personaPid;
  if (params?.forUniverses) cond.forUniverses = normalizeSystemPersonaUsageType(params.forUniverses);
  if (params?.q) {
    const rx = new RegExp(params.q, "i");
    cond.$or = [{ key: rx }, { title: rx }, { summary: rx }, { prompt: rx }];
  }
  return await model.find(cond).sort({ updatedAt: -1 }).lean();
}

export async function listSelectablePersonas(params: {
  service: SystemPersonaServiceType;
  q?: string;
  category?: string;
  enabled?: boolean;
  universeId?: string;
  personaPid?: string;
}) {
  const rows = await listPersonas({
    q: params.q,
    category: params.category,
    enabled: params.enabled,
    universeId: params.universeId,
    personaPid: params.personaPid,
  });
  return rows.filter((row) => {
    const metadata = normalizeSystemPersonaLifecycleMetadata(row);
    if (params.enabled !== false && (!row.enabled || metadata.lifecycle !== "published")) return false;
    if (!metadata.runtimeResolvable || !metadata.selectableServices.includes(params.service)) return false;
    if (params.universeId && row.universeId && row.universeId !== params.universeId) return false;
    if (params.personaPid && row.personaPid && row.personaPid !== params.personaPid) return false;
    return true;
  });
}

export async function upsertPersona(input: {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  prompt: string;
  forUniverses?: SystemPersonaUsageType;
  presetKind?: string;
  lifecycle?: string;
  selectableServices?: SystemPersonaServiceType[];
  runtimeResolvable?: boolean;
  replacementKey?: string;
  revision?: number;
  safetyProfile?: string;
  tutorsPolicyDefaults?: SystemPersonaTutorsPolicyDefaultsType;
  enabled?: boolean;
  updatedBy?: string;
  version?: number; // 명시적 제공 시에만 사용
  universeId?: string | null;
  personaPid?: string | null;
}) {
  const model = await getSystemPersonaModel();
  const key = normalizeKey(input.key);

  // 스코프 기본값은 null(=global)
  const universeId = input.universeId === undefined ? null : input.universeId;
  const personaPid = input.personaPid === undefined ? null : input.personaPid;

  // version은 기본적으로 insert에서만 1로 셋
  const $set: Record<string, unknown> = {
    title: input.title,
    category: input.category || "core",
    summary: input.summary || "",
    prompt: input.prompt || "",
    forUniverses: normalizeSystemPersonaUsageType(input.forUniverses),
    ...(input.presetKind ? { presetKind: input.presetKind } : {}),
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
    ...(input.selectableServices ? { selectableServices: input.selectableServices } : {}),
    ...(input.runtimeResolvable !== undefined ? { runtimeResolvable: input.runtimeResolvable } : {}),
    ...(input.replacementKey !== undefined ? { replacementKey: input.replacementKey } : {}),
    ...(input.revision !== undefined ? { revision: input.revision } : {}),
    ...(input.safetyProfile ? { safetyProfile: input.safetyProfile } : {}),
    tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(input.tutorsPolicyDefaults),
    enabled: input.enabled !== false,
    updatedBy: input.updatedBy || "",
  };

  const $setOnInsert: Record<string, unknown> = { key, createdAt: new Date(), version: 1, universeId, personaPid };

  // 명시적으로 version을 넘겼다면 그 값으로 덮어쓰기 허용
  if (typeof input.version === "number") {
    $set.version = input.version;
  }

  const doc = await model
    .findOneAndUpdate({ key, universeId, personaPid }, { $set, $setOnInsert }, { upsert: true, new: true })
    .lean();

  await redisCache.del(cacheKey(key, universeId, personaPid)); // 캐시 무효화(해당 스코프만)
  return doc;
}

export async function removePersona(key: string) {
  const model = await getSystemPersonaModel();
  const k = normalizeKey(key);
  const docs = await model.find({ key: k }).select({ universeId: 1, personaPid: 1 }).lean();
  await model.deleteMany({ key: k });
  if (docs?.length) {
    await Promise.all(docs.map((d) => redisCache.del(cacheKey(k, d.universeId ?? null, d.personaPid ?? null))));
  }
  return true;
}

export async function removePersonaByScope(
  key: string,
  opts?: { universeId?: string | null; personaPid?: string | null },
) {
  const model = await getSystemPersonaModel();
  const k = normalizeKey(key);
  const universeId = normalizeScopeValue(opts?.universeId);
  const personaPid = normalizeScopeValue(opts?.personaPid);

  await model.deleteOne({ key: k, universeId, personaPid });
  await redisCache.del(cacheKey(k, universeId, personaPid));
  return true;
}

// 특정 페르소나(pid)에 연결된 시스템 페르소나 전부 삭제
export async function removePersonasByPid(personaPid: string) {
  if (!personaPid) return false;

  const model = await getSystemPersonaModel();
  const cond: Record<string, unknown> = { personaPid };

  // 캐시 삭제를 위해 key만 조회
  const docs = await model.find(cond).select({ key: 1, universeId: 1, personaPid: 1 }).lean();

  // 실제 삭제
  await model.deleteMany(cond);

  // 캐시 무효화
  if (docs && docs.length) {
    await Promise.all(
      docs.map((d) => {
        const k = normalizeKey(d.key);
        return redisCache.del(cacheKey(k, d.universeId ?? null, d.personaPid ?? null));
      }),
    );
  }

  return true;
}
